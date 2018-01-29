'use strict';

/*
 TODO
 - Documenter
*/


var AudioRecord = function( sampleRate ) {
	this.sampleRate = sampleRate;
	this.sampleBlocs = [];
	this.length = 0;
};

AudioRecord.prototype.push = function( samples, rollingDuration ) {
	this.length += samples.length;
	this.sampleBlocs.push( samples );

	if ( rollingDuration !== undefined ) {
		var duration = this.getDuration();
		if ( duration > rollingDuration ) {
			this.ltrim( duration - rollingDuration );
		}
	}

	return this.length;
};

AudioRecord.prototype.setSampleRate = function( value ) {
	this.sampleRate = value;
};

AudioRecord.prototype.getSampleRate = function() {
	return this.sampleRate;
};

AudioRecord.prototype.getLength = function() {
	return this.length;
};

AudioRecord.prototype.getDuration = function() {
	return this.length / this.sampleRate;
};

AudioRecord.prototype.getSamples = function() {
	var flattened = new Float32Array( this.length + 575 ),
		nbBlocs = this.sampleBlocs.length,
		offset = 0;

	for ( var i = 0; i < nbBlocs; ++i ) {
		flattened.set( this.sampleBlocs[ i ], offset );
		offset += this.sampleBlocs[ i ].length
	}

	return flattened;
};

AudioRecord.prototype.ltrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.length ) {
		this.sampleBlocs = [];
		return;
	}

	this.length -= nbSamplesToRemove;
	while ( nbSamplesToRemove > 0 && nbSamplesToRemove >= this.sampleBlocs[ 0 ].length ) {
		nbSamplesToRemove -= this.sampleBlocs[ 0 ].length;
		this.sampleBlocs.shift();
	}
	if ( nbSamplesToRemove > 0 ) {
		this.sampleBlocs[ 0 ] = this.sampleBlocs[ 0 ].subarray( 0, this.sampleBlocs[ 0 ].length - nbSamplesToRemove );
	}
};

AudioRecord.prototype.rtrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.length ) {
		this.sampleBlocs = [];
		return;
	}

	this.length -= nbSamplesToRemove;
	while ( nbSamplesToRemove > 0 && nbSamplesToRemove >= this.sampleBlocs[ this.sampleBlocs.length - 1 ].length ) {
		nbSamplesToRemove -= this.sampleBlocs[ this.sampleBlocs.length - 1 ].length;
		this.sampleBlocs.pop();
	}
	if ( nbSamplesToRemove > 0 ) {
		var lastIndex = this.sampleBlocs.length - 1;
		this.sampleBlocs[ lastIndex ] = this.sampleBlocs[ lastIndex ].subarray( nbSamplesToRemove );
	}
};

AudioRecord.prototype.clear = function() {
	this.length = 0;
	this.sampleBlocs = [];
};

AudioRecord.prototype.play = function() {
	console.log('play')
	var audioContext = new window.AudioContext();

	var buffer = audioContext.createBuffer(1, this.length, 48000); //samplerate
	var channelData = buffer.getChannelData(0);
	var nbBlocs = this.sampleBlocs.length
	for ( var i = 0, t = 0; i < nbBlocs; i++ ) {
		var nbSamples = this.sampleBlocs[ i ].length;
		for ( var j = 0; j < nbSamples; j++ ) {
			channelData[t++] = this.sampleBlocs[ i ][ j ];
		}
	}

	var source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect( audioContext.destination );
	source.start();
};

AudioRecord.prototype.getBlob = function() {
	var buffer = new ArrayBuffer(44 + this.length * 2);
	var view = new DataView(buffer);
	var samples = this.getSamples();

	/* RIFF identifier */
	writeString(view, 0, 'RIFF');
	/* file length */
	view.setUint32(4, 32 + this.length * 2, true);
	/* RIFF type */
	writeString(view, 8, 'WAVE');
	/* format chunk identifier */
	writeString(view, 12, 'fmt ');
	/* format chunk length */
	view.setUint32(16, 16, true);
	/* sample format (raw) */
	view.setUint16(20, 1, true);
	/* channel count */
	view.setUint16(22, 1, true);
	/* sample rate */
	view.setUint32(24, this.sampleRate, true);
	/* byte rate (sample rate * block align) */
	view.setUint32(28, this.sampleRate * 2, true);
	/* block align (channel count * bytes per sample) */
	view.setUint16(32, 2, true);
	/* bits per sample */
	view.setUint16(34, 16, true);
	/* data chunk identifier */
	writeString(view, 36, 'data');
	/* data chunk length */
	view.setUint32(40, this.length * 2, true);

	for (var i = 0; i < this.length; i++){
		view.setInt16(44 + i * 2, samples[i] * 0x7FFF, true);
	}

	return new Blob( [view], {"type": "audio/wav"} );
};

AudioRecord.prototype.getWAVE = function() {
	return this.getBlob();
};

AudioRecord.prototype.getObjectURL = function () {
	return window.URL.createObjectURL( this.getBlob() );
};

AudioRecord.prototype.download = function ( fileName ) {
	var a = document.createElement( 'a' ),
		url = this.getObjectURL();

    fileName = fileName || 'record.wav';
    if ( fileName.toLowerCase().indexOf( '.wav', fileName.length - 4 ) === -1 ) {
        fileName += '.wav';
    }

	a.style = "display: none";
	a.href = url;
	a.download = fileName;

	document.body.appendChild( a );
	a.click();

	window.URL.revokeObjectURL( url );
	document.body.removeChild( a );
};

AudioRecord.prototype.getDomAudioElement = function () {
	var audio = document.createElement( 'audio' ),
	    source = document.createElement( 'source' );

    source.src = this.getObjectURL();
    source.type = 'audio/wav';
    audio.appendChild( source );
    return audio;
};


function writeString( dataview, offset, str ) {
	for ( var i = 0; i < str.length; i++ ){
		dataview.setUint8( offset + i, str.charCodeAt( i ) );
	}
};

