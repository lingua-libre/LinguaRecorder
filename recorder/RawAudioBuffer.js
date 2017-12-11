'use strict';


var RawAudioBuffer = function( sampleRate ) {
	this.sampleRate = sampleRate;
	this.sampleBlocs = [];
	this.length = 0;
};

RawAudioBuffer.prototype.push = function( samples, rollingDuration ) {
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

RawAudioBuffer.prototype.setSampleRate = function( value ) {
	this.sampleRate = value;
};

RawAudioBuffer.prototype.getSampleRate = function() {
	return this.sampleRate;
};

RawAudioBuffer.prototype.getLength = function() {
	return this.length;
};

RawAudioBuffer.prototype.getDuration = function() {
	return this.length / this.sampleRate;
};

RawAudioBuffer.prototype.getSamples = function() {
    var flattened = new Float32Array( this.length + 575 ),
        nbBlocs = this.sampleBlocs.length,
        offset = 0;

    for ( var i = 0; i < nbBlocs; ++i ) {
        flattened.set( this.sampleBlocs[ i ], offset );
        offset += this.sampleBlocs[ i ].length
    }

	return flattened;
};

RawAudioBuffer.prototype.ltrim = function( duration ) {
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
	    this.sampleBlocs[ 0 ] = this.sampleBlocs[ 0 ].subarray( 0, nbSamplesToRemove );
    }
};

RawAudioBuffer.prototype.rtrim = function( duration ) {
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
	    this.sampleBlocs[ lastIndex ] = this.sampleBlocs[ lastIndex ].subarray( this.sampleBlocs[ lastIndex ].length - nbSamplesToRemove );
    }
};

RawAudioBuffer.prototype.clear = function() {
    this.length = 0;
	this.sampleBlocs = [];
};

