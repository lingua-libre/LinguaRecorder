'use strict';

var STATE = {
	stop: 'stop',
	listening: 'listen',
	recording: 'record',
	paused: 'pause',
}

/*
TODO
- benefit from the MediaTrackConstraints when geting the stream
- replace STATE
*/

/**
 *
 *
 * @constructor
 * @param {Object} [config] Configuration options
 * @cfg {boolean} [autoStart=false] Set to true to wait for voice detection when calling the start() method.
 * @cfg {boolean} [autoStop=false] Set to true to stop the record when there is a silence.
 * @cfg {number} [bufferSize=4096] Set the size of the samples buffers. Could be 0 (let the browser choose the best one) or one of the following values: 256, 512, 1024, 2048, 4096, 8192, 16384; the less the more precise, the higher the more efficient.
 * @cfg {number} [timeLimit=0] Maximum time (in seconds) after which it is necessary to stop recording. Set to 0 (default) for no time limit.
 * @cfg {string} [onSaturate='none'] Tell what to do when a record is saturated. Accepted values are 'none' (default), 'cancel' and 'discard'.
 * @cfg {number} [saturationThreshold=0.99] Amplitude value between 0 and 1 included. Only used if onSaturate is different from 'none'. Threshold above which a record should be flagged as saturated.
 * @cfg {number} [startThreshold=0.1] Amplitude value between 0 and 1 included. Only used if autoStart is set to true. Amplitude to reach to auto-start the recording.
 * @cfg {number} [stopThreshold=0.05] Amplitude value between 0 and 1 included. Only used if autoStop is set to true. Amplitude not to exceed in a stopDuration interval to auto-stop recording.
 * @cfg {number} [stopDuration=0.3] Duration value in seconds. Only used if autoStop is set to true. Duration during which not to exceed the stopThreshold in order to auto-stop recording.
 * @cfg {number} [marginBefore=0.25] Duration value in seconds. Only used if autoStart is set to true.
 * @cfg {number} [marginAfter=0.25] Duration value in seconds. Only used if autoStop is set to true.
 * @cfg {number} [minDuration=0.15] Duration value in seconds. Discard the record if it last less than minDuration. Default value to 0.15, use 0 to disable.
 */
var LinguaRecorder = function( config ) {
	// Configuration initialization
	config = config || {};

	this.stream = null;

	this.autoStart = config.autoStart === true;
	this.autoStop = config.autoStop === true;
	this.bufferSize = config.bufferSize || 4096;
	this.timeLimit = config.timeLimit || 0;
	this.cancelOnSaturate = config.onSaturate === 'cancel';
	this.discardOnSaturate = config.onSaturate === 'discard';
	this.saturationThreshold = config.saturationThreshold || 0.99;

	this.startThreshold = config.startThreshold === undefined ? 0.1 : config.startThreshold;
	this.stopThreshold = config.stopThreshold === undefined ? 0.05 : config.stopThreshold;
	this.stopDuration = config.stopDuration === undefined ? 0.3 : config.stopDuration;
	this.marginBefore = config.marginBefore === undefined ? 0.25 : config.marginBefore;
	this.marginAfter = config.marginAfter === undefined ? 0.25 : config.marginAfter;
	this.minDuration = config.minDuration === undefined ? 0.15 : config.minDuration;

	this._state = STATE.stop;
	this._audioRecord = null;
	this._silenceSamplesCount = 0;
	this._isSaturated = false;

	this._eventHandlers = {
		ready: [],
		readyFail: [],
		started: [],
		listening: [],
		recording: [],
		saturated: [],
		paused: [],
		stoped: [],
		canceled: [],
	};
	this._eventStorage = {
		ready: null,
		readyFail: null,
	};
	this._extraAudioNodes = [];


	this._getAudioStream();
};




/**
 * Return the current duration of the recording.
 *
 * @return {number} The duration in seconds
 */
LinguaRecorder.prototype.getRecordingTime = function() {
	return this._audioRecord.getDuration();
};


/**
 * Return the current state of the recorder.
 *
 * @return {string} One of the following: 'stop', 'listening', 'recording', 'paused'
 */
LinguaRecorder.prototype.getState = function() {
	return this._state;
};


/**
 * Return the audioContext initialised and used by the recorder.
 *
 * see https://developer.mozilla.org/fr/docs/Web/API/AudioContext
 *
 * @return {AudioContext} The AudioContext object used by the recorder.
 */
LinguaRecorder.prototype.getAudioContext = function() {
	return this.audioContext;
};


/**
 * Start to record.
 *
 * If autoStart is set to true, enter in listening state and postpone the start
 * of the recording when a voice will be detected.
 *
 * @return {boolean} Has the record being started or not.
 */
LinguaRecorder.prototype.start = function() {
	if ( this.audioContext === undefined || this._state === STATE.listening || this._state === STATE.recording ) {
		return false;
	}

	if ( this._state === STATE.stop ) {
		this._audioRecord = new AudioRecord( this.audioContext.sampleRate );
		this._silenceSamplesCount = 0;
		this._isSaturated = false;

		if ( this.autoStart ) {
			this._state = STATE.listening;
			this._connect();
			return true;
		}
	}

	this._state = STATE.recording;
	this._connect();

	this._fire( 'started' );

	return true;
};


/**
 * Switch the record to the pause state.
 *
 * While in pause, all the inputs comming from the microphone will be ignored.
 * To resume to the recording state, just call the start() method again.
 * It is also still possible to stop() or cancel() a record,
 * and you have to do so upstream if you wish to start a new one.
 *
 * @return {boolean} Has the record being paused or not.
 */
LinguaRecorder.prototype.pause = function() {
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

	this._fire( 'paused' );
	return true;
};


/**
 * Stop the recording process and fire the record to the user.
 *
 * Depending of the configuration, this method could discard the record
 * if it fails some quality controls (duration and saturation).
 *
 * To start a new record afterwards, just call the start() method again.
 *
 * @param {boolean} [cancelRecord=false] Used to cancel a record. If set to true, discard the record in any cases.
 * @return {boolean} Has the record being stopped or not.
 */
LinguaRecorder.prototype.stop = function( cancelRecord ) {
	var cancelRecord = false || cancelRecord;

	if ( this._state === STATE.stop ) {
		return false;
	}

	if ( this._state !== STATE.paused ) {
		this._disconnect();
	}
	this._state = STATE.stop
	if ( cancelRecord === true ) {
		this._audioRecord = null;
		this._fire( 'canceled', 'asked' );
	}
	else if ( ( this.discardOnSaturate || this.cancelOnSaturate ) && this._isSaturated ) {
		this._audioRecord = null;
		this._fire( 'canceled', 'saturated' );
	}
	else if ( this._audioRecord.getDuration() < this.minDuration ) {
		this._audioRecord = null;
		this._fire( 'canceled', 'tooShort' );
	}
	else {
		this._fire( 'stoped', this._audioRecord );
	}

	return true;
};


/**
 * Stop a recording, but without saving the record.
 *
 * @return {boolean} Has the record being stopped or not.
 */
LinguaRecorder.prototype.cancel = function() {
	return this.stop( true );
};


/**
 * Toggle between the recording and stopped state.
 */
LinguaRecorder.prototype.toggle = function() {
	if ( this._state === STATE.recording || this._state === STATE.listening ) {
		this.stop();
	}
	else {
		this.start();
	}
};


/**
 * Attach a handler function to a given event.
 *
 * @param {string} [event] Name of an event.
 * @param {function} [handler] A function to execute when the event is triggered.
 * @chainable
 */
LinguaRecorder.prototype.on = function( event, handler ) {
	if ( event in this._eventHandlers ) {
		this._eventHandlers[ event ].push( handler );
	}

	// For one-time events, re-fire it if it already occured
	if ( event in this._eventStorage && this._eventStorage[ event ] !== null ) {
		handler( this._eventStorage[ event ] );
	}

	return this;
};


/**
 * Remove all the handler function from an event.
 *
 * @param {string} [event] Name of an event.
 * @chainable
 */
LinguaRecorder.prototype.off = function( event ) {
	if ( event in this._eventHandlers ) {
		this._eventHandlers[ event ] = [];
	}

	return this;
};


/**
 * Add an extra AudioNode
 *
 * This can be used to draw a live visualisation of the sound, or to perform
 * some live editing tasks on the stream before it is recorded.
 *
 * Note that it can produce a little interrupt in the record if you are in
 * listening or recording state.
 *
 * @param {AudioNode} [node] Node to connect inside the recording context.
 * @chainable
 */
LinguaRecorder.prototype.connectAudioNode = function( node ) {
	if ( this._state === STATE.listening || this._state === STATE.recording ) {
		this._disconnect();
	}
	this._extraAudioNodes.push( node );
	if ( this._state === STATE.listening || this._state === STATE.recording ) {
		this._connect();
	}
	return this;
};


/**
 * Remove an extra AudioNode
 *
 * Note that it can produce a little interrupt in the record if you are in
 * listening or recording state.
 *
 * @param {AudioNode} [node] Node to disconnect from the recording context.
 * @chainable
 */
LinguaRecorder.prototype.disconnectAudioNode = function( node ) {
	for ( var i = 0; i < this._extraAudioNodes.length; i++ ) {
		if ( node === this._extraAudioNodes[ i ] ) {
			if ( this._state === STATE.listening || this._state === STATE.recording ) {
				this._disconnect();
			}
			this._extraAudioNodes.splice( i, 1 );
			if ( this._state === STATE.listening || this._state === STATE.recording ) {
				this._connect();
			}
			break;
		}
	}

	return this;
};


/**
 * Fire a give event to all the registred handlers functions.
 *
 * For one-time events (ready, readyFail), stores the firered value
 * to be able to re-fire it for listners that are registered later
 *
 * @param {string} [event] Name of the event to fire.
 * @return {Object|Array|string|undefined} [value] Bounds if valid.
 * @private
 */
LinguaRecorder.prototype._fire = function( event, value ) {
	if ( event in this._eventHandlers ) {
		for ( var i=0; i<this._eventHandlers[ event ].length; i++ ) {
			this._eventHandlers[ event ][ i ]( value );
		}
	}

	if ( event in this._eventStorage ) {
		this._eventStorage[ event ] = value;
	}
};


/**
 * First step to initialise the LinguaRecorder object. Try to get a MediaStream object
 * with tracks containing an audio input from the microphone of the user.
 *
 * Note that it will prompt a notification requesting permission from the user.
 * Furthermore, modern browsers requires the use of HTTPS to allow it.
 *
 * for more details: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 *
 * @private
 */
LinguaRecorder.prototype._getAudioStream = function() {
	var recorder = this;

	// Current best practice to get the audio stream according to the specs
	if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia({audio: true, video:false})
		.then(function(localMediaStream) {
			recorder.stream = localMediaStream;
			recorder._initStream();
			recorder._fire( 'ready', localMediaStream );
			console.log('ready')
		} ).catch(function(err) {
			recorder._fire( 'readyFail', err );
			console.log('error');
			console.log(err)
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
				recorder._fire( 'ready', localMediaStream );
			},
			function(err) {
				recorder._fire( 'readyFail', err );
			}
		);
	}
};


/**
 * Called once we got a MediaStream. Create an AudioContext and
 * some needed AudioNode.
 *
 * for more details: https://developer.mozilla.org/fr/docs/Web/API/AudioNode
 *
 * @private
 */
LinguaRecorder.prototype._initStream = function() {
	var recorder = this;

	this._state = STATE.stop;

	// The 'Webkit' prefix is here to support old Chrome and Opera versions
	this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
	this.audioInput = this.audioContext.createMediaStreamSource( this.stream );

	// Workaround to support old versions of Chrome
	if ( this.audioContext.createScriptProcessor === undefined ) {
		this.audioContext.createScriptProcessor = this.audioContext.createJavaScriptNode;
	}

	this.processor = this.audioContext.createScriptProcessor( this.bufferSize, 1, 1 );
	this.processor.onaudioprocess = function( e ) {
		if ( recorder._state === STATE.listening ) {
			recorder._audioListeningProcess( e );
		}
		else if ( recorder._state === STATE.recording ) {
			recorder._audioRecordingProcess( e );
		}
	};
	this.audioInput.connect( this.processor );
};


/**
 * Connect the audioInput node to a processor node, choosen depending of the
 * current state of the recorder.
 *
 * If some AudioNodes are set through the connectAudioNode() method,
 * it connect them also in between.
 *
 * @private
 */
LinguaRecorder.prototype._connect = function() {
	var processor;

	var currentNode = this.audioInput;
	for ( var i=0; i < this._extraAudioNodes.length; i++ ) {
		currentNode.connect( this._extraAudioNodes[ i ] );
		currentNode = this._extraAudioNodes[ i ];
	}

	this.processor.connect( this.audioContext.destination );
}


/**
 * Disconnect the audioInput node from the currently connected processor node.
 *
 * @private
 */
LinguaRecorder.prototype._disconnect = function() {
	for ( var i=0; i < this._extraAudioNodes.length; i++ ) {
		this._extraAudioNodes[ i ].disconnect();
	}
}


/**
 * Event handler for the listening ScriptProcessorNode.
 *
 * Check whether it can auto-start recording, or store
 * the last marginBefore seconds incomming from the microphone.
 *
 * @private
 */
LinguaRecorder.prototype._audioListeningProcess = function( e ) {
	// Get the samples from the input buffer
	var samples = new Float32Array( e.inputBuffer.getChannelData( 0 ) ); // Copy the samples in a new Float32Array, to avoid memory dealocation

	// Analyse the sound to autoStart when it should
	for ( var i=0; i < samples.length; i++ ) {
		var amplitude = Math.abs( samples[ i ] );
		if ( amplitude > this.startThreshold ) {
			// start the record
			this._state = STATE.recording;
			this._fire( 'started' );
			return this._audioRecordingProcess( e );
		}
	}

	// Store the sound in the AudioRecord object
	if ( this.marginBefore > 0 ) {
		this._audioRecord.push( samples, this.marginBefore );
	}
	this._fire( 'listening', samples );
};


/**
 * Event handler for the recording ScriptProcessorNode.
 *
 * In charge of saving the incomming audio stream from the user's microphone
 * into the rawAudioBuffer.
 *
 * Check also if the incomming sound is not saturated, if the timeLimit
 * is not reached, and if the record should auto-stop.
 *
 * @private
 */
LinguaRecorder.prototype._audioRecordingProcess = function( e ) {
	// Get the samples from the input buffer
	var samples = new Float32Array( e.inputBuffer.getChannelData( 0 ) ); // Copy the samples in a new Float32Array, to avoid memory dealocation

	// Store the sound in the AudioRecord object
	this._audioRecord.push( samples );
	this._fire( 'recording', samples );

	// Check if the samples are not saturated
	for ( var i=0; i < samples.length; i++ ) {
		var amplitude = Math.abs( samples[ i ] );
		if ( amplitude > this.saturationThreshold ) {
			this._fire( 'saturated' );
			this._isSaturated = true;
			if ( this.cancelOnSaturate ) {
				this.stop();
				return;
			}
			break;
		}
	}

	// Analyse the sound to autoStop if needed
	if ( this.autoStop ) {
		var amplitudeMax = 0;
		for ( var i=0; i < samples.length; i++ ) {
			var amplitude = Math.abs( samples[ i ] );
			if ( amplitude > amplitudeMax ) {
				amplitudeMax = amplitude;
			}
		}

		if ( amplitudeMax < this.stopThreshold ) {
			this._silenceSamplesCount += samples.length;

			if ( this._silenceSamplesCount >= ( this.stopDuration * this.audioContext.sampleRate ) ) {
				this._audioRecord.rtrim( this.stopDuration - this.marginAfter );
				this.stop();
			}
		}
		else {
			this._silenceSamplesCount = 0;
		}
	}

	// If one is set, check if we have not reached the time limit
	if ( this.timeLimit > 0 ) {
		if ( this.timeLimit >= this._audioRecord.getDuration() ) {
			this.stop();
		}
	}
};

