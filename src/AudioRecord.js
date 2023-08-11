'use strict';

/**
 * AudioRecord
 *
 * @constructor
 * @param {number} [sampleRate] Rate at witch the samples added to this object should be played
 */
var AudioRecord = function( samples, sampleRate ) {
	this.sampleRate = sampleRate;
	this.samples = samples;
};

/**
 * Some MIME-type analyzer are just checking if the UTF-8 decoded file
 * contains the strings "<?php" or "<\x00?\x00". So by banning 4 samples
 * ("?\x00" ; "\x00?" ; "ph" ; "hp"), we get rid of all problems
 * see https://phabricator.wikimedia.org/T212584
 */
const BANNED_SAMPLES = [ 0x003F, 0x3F00, 0x6870, 0x7068 ];



/**
 * Change the sample rate.
 *
 * @param {number} [value] new sample rate to set.
 */
AudioRecord.prototype.setSampleRate = function( value ) {
	this.sampleRate = value;
};


/**
 * Get the sample rate in use.
 *
 * @return {number} Current sample rate for the record.
 */
AudioRecord.prototype.getSampleRate = function() {
	return this.sampleRate;
};


/**
 * Get the total number of samples in the record.
 *
 * @return {number} number of samples.
 */
AudioRecord.prototype.getLength = function() {
	return this.samples.length;
};


/**
 * Get the duration of the record.
 *
 * This is based on the number of samples and the declared sample rate.
 *
 * @return {number} duration (in seconds) of the record.
 */
AudioRecord.prototype.getDuration = function() {
	return this.samples.length / this.sampleRate;
};


/**
 * Get all the raw samples that make up the record.
 *
 * @return {Float32Array} list of all samples.
 */
AudioRecord.prototype.getSamples = function() {
	return this.samples;
};


/**
 * Trim the record, starting with the beginning of the record (the left side).
 *
 * @param {number} [duration] duration (in seconds) to trim
 */
AudioRecord.prototype.ltrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.samples.length ) {
		this.clear();
		return;
	}

	this.samples = this.samples.subarray( 0, this.samples.length - nbSamplesToRemove );
};


/**
 * Trim the record, starting with the end of the record (the right side).
 *
 * @param {number} [duration] duration (in seconds) to trim
 */
AudioRecord.prototype.rtrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.samples.length ) {
		this.clear();
		return;
	}
	
	this.samples = this.samples.subarray( nbSamplesToRemove );
};


/**
 * Clear the record.
 */
AudioRecord.prototype.clear = function() {
	this.samples = new Float32Array( 0 );
};


/**
 * Play the record to the audio output (aka the user's loudspeaker)
 */
AudioRecord.prototype.play = function() {
	var audioContext = new window.AudioContext();

	var buffer = audioContext.createBuffer(1, this.samples.length, 48000); //samplerate
	var channelData = buffer.getChannelData(0);
	for ( var i = 0; i < this.samples.length; i++ ) {
		channelData[i] = this.samples[ i ];
	}

	var source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect( audioContext.destination );

	source.start(0);
};


/**
 * Get a WAV-encoded Blob version of the record.
 *
 * @return {Blob} WAV-encoded audio record.
 * @alias getWAVE()
 */
AudioRecord.prototype.getBlob = function() {
	var sample,
		buffer = new ArrayBuffer(44 + this.samples.length * 2),
		view = new DataView(buffer);

	/* RIFF identifier */
	writeString(view, 0, 'RIFF');
	/* file length */
	view.setUint32(4, 32 + this.samples.length * 2, true);
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
	view.setUint32(40, this.samples.length * 2, true);

	for (var i = 0; i < this.samples.length; i++){
		/* Turn a 0->1 amplitude to 0->0x7FFF (highest number possible in a signed 16bits integer) */
		sample = parseInt( this.samples[i] * 0x7FFF );
		/* Get rid of banned samples by incrementing it */
		if ( BANNED_SAMPLES.indexOf( sample ) > -1 ) {
			sample++;
		}
		/* Append the sample in the data chunck */
		view.setInt16(44 + i * 2, sample, true);
	}

	return new Blob( [view], {"type": "audio/wav"} );
};


/**
 * @alias getBlob()
 */
AudioRecord.prototype.getWAVE = function() {
	return this.getBlob();
};


/**
 * Generate an object URL representing the WAV-encoded record.
 *
 * For performance reasons, you should unload the objectURL once you're
 * done with it, see
 * https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL
 *
 * @return {DOMString} URL representing the record.
 */
AudioRecord.prototype.getObjectURL = function () {
	return window.URL.createObjectURL( this.getBlob() );
};


/**
 * Start the download process of the record as if it where a normal file.
 *
 * @param {String} [fileName='record.wav'] name of the file that will be downloaded
 */
AudioRecord.prototype.download = function ( fileName ) {
	var a = document.createElement( 'a' ),
		url = this.getObjectURL();

	fileName = fileName || 'record.wav';
	if ( fileName.toLowerCase().indexOf( '.wav', fileName.length - 4 ) === -1 ) {
		fileName += '.wav';
	}

	a.style.display = "none";
	a.href = url;
	a.download = fileName;

	document.body.appendChild( a );
	a.click();

	// It seems that old browser take time to take into account the click
	// So we delay the deletion of the URL to let them enough time to start the download
	setTimeout( function() {
		document.body.removeChild( a );
		window.URL.revokeObjectURL( url );
	}, 1000 );
};


/**
 * Generate an HTML5 <audio> element containing the WAV-encoded record.
 *
 * @return {HTMLElement} audio element containing the record.
 */
AudioRecord.prototype.getAudioElement = function () {
	var audio = document.createElement( 'audio' ),
		source = document.createElement( 'source' );

	source.src = this.getObjectURL();
	source.type = 'audio/wav';
	audio.appendChild( source );
	return audio;
};




/**
 * Internal helper function used in getBlob to write a complete string at once
 * in a DataView object.
 *
 * @param {DataView} [dataview] DataView in which to write.
 * @param {number} [offset] Offset at which writing should start.
 * @param {String} [str] String to write in the DataView.
 */
function writeString( dataview, offset, str ) {
	for ( var i = 0; i < str.length; i++ ){
		dataview.setUint8( offset + i, str.charCodeAt( i ) );
	}
};

