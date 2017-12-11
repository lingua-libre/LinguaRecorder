'use strict';

const STATE = {
    stop: 'stop',
    listening: 'listening',
    recording: 'recording',
    paused: 'paused',
}

/*
TODO
- Audio class
  - raw to download
  - raw to wav
  - raw to html5
- saturation control
- buffer size
- time limit
- GUI
- clean useless config
- rtrim on autostop
- documentation
*/

/**
 *
 *
 * @constructor
 * @param {Object} [config] Configuration options
 * @cfg {boolean} [autoStart]
 * @cfg {boolean} [autoStop]
 * @cfg {boolean} [autoRestart]
 * @cfg {integer} [bufferSize]
 * @cfg {integer} [timeLimit]
 * @cfg {boolean} [saturationControl] Whether the recorder should discard the record when it saturate
 * @cfg {} []
 * @cfg {} []
 */
var Recorder = function( config ) {
	// Configuration initialization
	config = config || {};

	this.stream = null;

    this.autoStart = false || config.autoStart;
    this.autoStop = false || config.autoStop;
    this.autoRestart = false || config.autoRestart;
    this.bufferSize = 4096 || config.bufferSize;
    this.timeLimit = null || config.timeLimit;
	this.saturationControl = 0.99 || config.saturationControl;
	this.startThreshold = 0.1 || config.startThreshold;
	this.silenceThreshold = 0.05 || config.silenceThreshold;
	this.bufferLength = 0.8 || config.bufferLength;
	this.marginBefore = 0.5 || config.marginBefore;
	this.marginAfter = 0.25 || config.marginAfter;
	this.stopSilence = 0.3 || config.stopSilence;
	this.minimalLength = 0.15 || config.minimalLength;

	this._state = STATE.stop;

	this._eventListeners = {
		ready: [],
		readyFail: [],
		started: [],
		listening: [],
		recording: [],
		paused: [],
		stoped: [],
		canceled: [],
		recordReady: [],
	};
	this._eventStorage = {
		ready: null,
		readyFail: null,
	};


	this._getAudioStream();
};



/* Methods */

Recorder.prototype.getVolume = function() {

};

Recorder.prototype.getRecordingTime = function() {

};

Recorder.prototype.getAudioBuffer = function() {
    return this.rawAudioBuffer;
};

Recorder.prototype.getEncodedRecord = function() {

};

Recorder.prototype.start = function() {
	if ( this.audioContext === undefined || this._state in [ STATE.listening, STATE.recording ] ) {
	    return false;
	}

	if ( this._state === STATE.stop ) {
		this._initAttr();

        if ( this.autoStart ) {
            this._state = STATE.listening;
            this._connect();

            return true;
        }
	}

    this._state = STATE.recording;
    this._connect();

    this.fire( 'started' );

	return true;
};

Recorder.prototype.pause = function() {
    if ( this._state !== STATE.recording ) {
        return false;
    }

	this._disconnect();
	if ( this._state === STATE.listening ) {
	    this._state = STATE.stop;
	}
	else {
	    this._state = STATE.paused;
	}

	this.fire( 'paused' );
	return true;
};

Recorder.prototype.stop = function() {
    if ( this._state === STATE.stop ) {
        return false;
    }

    if ( this._state !== STATE.paused ) {
	    this._disconnect();
	}
	this._state = STATE.stop

	this.fire( 'stoped', this.rawAudioBuffer );

	if ( this.autoRestart ) {
	    this.start();
	}

	return true;
};

Recorder.prototype.cancel = function() {
    if ( this._state === STATE.stop ) {
        return false;
    }

    if ( this._state !== STATE.paused ) {
	    this._disconnect();
	}
	this._state = STATE.stop

	this.fire( 'canceled' );
	return true;
};

Recorder.prototype.toggle = function() {
	if ( this._state in [ STATE.recording, STATE.listening ] ) {
		this.stop();
	}
	else {
		this.start();
	}
};

Recorder.prototype.on = function( event, listener ) {
	if ( event in this._eventListeners ) {
		this._eventListeners[ event ].push( listener );
	}

	// For one-time events, re-fire it if it already occured
	if ( event in this._eventStorage && this._eventStorage[ event ] !== null ) {
	    listener( this._eventStorage[ event ] );
	}

	return this;
};

Recorder.prototype.off = function( event ) {
	if ( event in this._eventListeners ) {
		this._eventListeners[ event ] = [];
	}

	return this;
};

Recorder.prototype.fire = function( event, value ) {
	if ( event in this._eventListeners ) {
		for ( var i=0; i<this._eventListeners[ event ].length; i++ ) {
			this._eventListeners[ event ][ i ]( value );
		}
	}

	// For one-time events, store the fired value
	// to be able to re-fire it for listners that are registered later
	if ( event in this._eventStorage ) {
	    this._eventStorage[ event ] = value;
	}
};



Recorder.prototype._getAudioStream = function() {
	var recorder = this;

	if ( this.stream !== null ) {
		return true;
	}

	// Current best practice to get the audio stream according to the specs
	if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia({audio: true, video:false})
		.then(function(localMediaStream) {
			recorder.stream = localMediaStream;
			recorder._initStream();
			recorder.fire( 'ready', localMediaStream );
		} ).catch(function(err) {
			recorder.fire( 'readyFail', err );
		} );
	}
	// Legacy methods, kept to support old browsers
	else {
		navigator.getUserMediaFct = ( navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
		if (!navigator.getUserMediaFct) {
			return;
		}

		navigator.getUserMediaFct(
			{"audio": true, "video": false},
			function(localMediaStream) {
				recorder.stream = localMediaStream;
				recorder._initStream();
				recorder.fire( 'ready', localMediaStream );
			},
			function(err) {
				recorder.fire( 'readyFail', err );
			}
		);
	}
};

Recorder.prototype._initStream = function() {
	var recorder = this;

    this.audioContext = new window.AudioContext();
	this.audioInput = this.audioContext.createMediaStreamSource( this.stream );

	this._initAttr();

	this.listeningProcessor = this.audioContext.createScriptProcessor( this.bufferLen, 1, 1 );
	this.listeningProcessor.onaudioprocess = function( e ) {
		recorder._audioListeningProcess( e );
	};

	this.recordingProcessor = this.audioContext.createScriptProcessor( this.bufferLen, 1, 1 );
	this.recordingProcessor.onaudioprocess = function( e ) {
		recorder._audioRecordingProcess( e );
	};
};

Recorder.prototype._connect = function() {
    var processor;
    if ( this._state === STATE.listening ) {
        processor = this.listeningProcessor;
    }
    else {
        processor = this.recordingProcessor;
    }

    this.audioInput.connect( processor );
    processor.connect( this.audioContext.destination );
}

Recorder.prototype._disconnect = function() {
    var processor;
    if ( this._state === STATE.listening ) {
        processor = this.listeningProcessor;
    }
    else {
        processor = this.recordingProcessor;
    }

	this.audioInput.disconnect( processor );
	processor.disconnect( this.audioContext.destination );
}

Recorder.prototype._audioListeningProcess = function( e ) {
    // Discard extra samples if the recording has already been paused or stopped
	if ( this._state in [ STATE.stop, STATE.paused ] ) {
	    return;
	}

	// Get the samples from the input buffer
	var samples = new Float32Array( e.inputBuffer.getChannelData( 0 ) ); // Copy the samples in a new Float32Array, to avoid memory dealocation

    // Analyse the sound to autoStart when it should
    for ( var i=0; i < samples.length; i++ ) {
        var amplitude = Math.abs( samples[ i ] );
        if ( amplitude > this.startThreshold ) {
            // start the record
            this._disconnect();
            this._state = STATE.recording;
            this._connect();
	        this.fire( 'started' );
            return this._audioRecordingProcess( e );
        }
    }

	// Store the sound in the RawAudioBuffer
    if ( this.marginBefore > 0 ) {
        this.rawAudioBuffer.push( samples, this.marginBefore );
    }
    this.fire( 'listening', samples );
};

Recorder.prototype._audioRecordingProcess = function( e ) {
    // Discard extra samples if the recording has already been paused or stopped
	if ( this._state in [ STATE.stop, STATE.paused ] ) {
	    return;
	}

	// Get the samples from the input buffer
	var samples = new Float32Array( e.inputBuffer.getChannelData( 0 ) ); // Copy the samples in a new Float32Array, to avoid memory dealocation

	// Store the sound in the RawAudioBuffer
    this.rawAudioBuffer.push( samples );
    this.fire( 'recording', samples );

    // Analyse the sound to autoStop if needed
    if ( this.autoStop ) {
        var amplitudeMax = 0;
        for ( var i=0; i < samples.length; i++ ) {
            var amplitude = Math.abs( samples[ i ] );
            if ( amplitude > amplitudeMax ) {
                amplitudeMax = amplitude;
            }
        }

        if ( amplitudeMax < this.silenceThreshold ) {
            this._silenceSamplesCount += samples.length;

            if ( this._silenceSamplesCount >= ( this.stopSilence * this.audioContext.sampleRate ) ) {
                this.stop();
            }
        }
        else {
	        this._silenceSamplesCount = 0;
        }
    }
};

Recorder.prototype._initAttr = function() {
	this.rawAudioBuffer = new RawAudioBuffer( this.audioContext.sampleRate );
	this._silenceSamplesCount = 0;
};




