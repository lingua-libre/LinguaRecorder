/**
 *
 *
 * @constructor
 * @param {Object} [config] Configuration options
 * @cfg {boolean} [saturationControl] Whether the recorder should discard the record when it saturate
 * @cfg {boolean} [autoStart]
 * @cfg {boolean} [autoStop]
 * @cfg {integer} [bufferSize]
 * @cfg {integer} [timeLimit]
 * @cfg {boolean} [encodeAfterRecord]
 * @cfg {integer} [progressInterval] (in millisec)
 * @cfg {} []
 * @cfg {} []
 * @cfg {} []
 */
var Recorder = function( config ) {
	// Configuration initialization
	config = config || {};

	this.stream = null;
	this._recording = false;
	this._paused = false;
	this._eventListeners = {
		ready: [],
		readyFail: [],
		started: [],
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

Recorder.prototype.getSamples = function() {

};

Recorder.prototype.getEncodedRecord = function() {

};

Recorder.prototype.start = function() {
	if ( this.node === undefined || this._recording ) {
	    return false;
	}

	if ( ! this._paused ) {
		this._clear();
	}
	this._recording = true;
	this._paused = false;
	this.audioInput.connect(this.node);
	this.node.connect(this.audioContext.destination);

	this.fire( 'started' );
	return true;
};

Recorder.prototype.pause = function() {
    if ( ! this._recording ) {
        return false;
    }

	this.audioInput.disconnect( this.node );
	this.node.disconnect( this.audioContext.destination );
	this._recording = false;
	this._paused = true;

	this.fire( 'paused' );
	return true;
};

Recorder.prototype.stop = function() {
    if ( ! this._recording && ! this._paused ) {
        return false;
    }

    if ( ! this._paused ) {
	    this.audioInput.disconnect( this.node );
	    this.node.disconnect( this.audioContext.destination );
	    this._recording = false;
	}
	this._paused = false;

	this.fire( 'stoped' );
	return true;
};

Recorder.prototype.cancel = function() {
    if ( ! this._recording && ! this._paused ) {
        return false;
    }

	this.audioInput.disconnect( this.node );
	this.node.disconnect( this.audioContext.destination );
	this._recording = false;
	this._paused = false;

	this.fire( 'canceled' );
	return true;
};

Recorder.prototype.toggle = function() {
	if ( this._recording ) {
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
    this.audioContext = new window.AudioContext();
	this.audioInput = this.audioContext.createMediaStreamSource( this.stream );
	this.buffers = new Buffers();
	this.buffers.setSamplerate( this.audioContext.sampleRate );
    console.log(this.bufferLen);
	this.node = this.audioContext.createScriptProcessor(this.bufferLen, 1, 1);

	var recorder = this;
	this.node.onaudioprocess = function(e) {
		recorder._onaudioprocess(e);
	};
};

Recorder.prototype._onaudioprocess = function(e) {
	if ( ! this._recording || this._paused ) {
	    return;
	}

	//Copy the samples in a new Float32Array, to avoid memory dealocation
	var samples = new Float32Array(e.inputBuffer.getChannelData(0));
	var buffer = new Buffer(samples);
	this.buffers.push(buffer);
	console.log( this.buffers.getLength() ); //TODO
	this.fire( 'recording', buffer );
};

Recorder.prototype._clear = function() {
	this.buffers.clear();
};




