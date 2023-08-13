'use strict';


const STATE = {
	stop: 'stop',
	listening: 'listen',
	recording: 'record',
	paused: 'pause',
}


/**
 * @class LinguaRecorder
 * Provides many powerful tools to easily perform audio recordings.
 */
class LinguaRecorder {
	stream = null;
	recordProcessorConfig = {};
	audioContext = null;
	audioInput = null;
	processor = null;
	_state = STATE.stop;
	_isConnected = false;
	_duration = 0;
	_extraAudioNodes = [];
	_eventHandlers = {
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
	_eventStorage = {
		ready: null,
		readyFail: null,
	};

	/**
	 * Creates a new LinguaRecorder instance
	 * 
	 * @param {Object} [config] Configuration options to pass to the RecordingProcessor
	 */
	constructor( config ) {
		this.setConfig( config );
		this._getAudioStream();
	}


	/**
	 * Change the processor configuration.
	 *
	 * @param {Object} [config] Configuration options, see the constructor for config documentation.
	 * @chainable
	 */
	setConfig( config ) {
		this.recordProcessorConfig = {
			...this.recordProcessorConfig,
			...config
		};

		this._sendCommandToProcessor( 'setconfig', this.recordProcessorConfig );

		return this;
	}


	/**
	 * Return the current duration of the recording.
	 *
	 * @return {Number} The duration in seconds
	 */
	getRecordingTime() {
		return this._duration;
	}


	/**
	 * Return the current state of the recorder.
	 *
	 * @return {String} One of the following: 'stop', 'listening', 'recording', 'paused'
	 */
	getState() {
		return this._state;
	}


	/**
	 * Return the audioContext initialised and used by the recorder.
	 * see https://developer.mozilla.org/fr/docs/Web/API/AudioContext
	 *
	 * @return {AudioContext} The AudioContext object used by the recorder.
	 */
	getAudioContext() {
		return this.audioContext;
	}


	/**
	 * Start to record.
	 *
	 * If autoStart is set to true, enter in listening state and postpone the start
	 * of the recording when a voice will be detected.
	 *
	 * @chainable
	 */
	start() {
		if ( this.processor === null ) {
			return this;
		}

		this._connect();
		return this._sendCommandToProcessor( 'start' );
	}


	/**
	 * Switch the record to the pause state.
	 *
	 * While in pause, all the inputs comming from the microphone will be ignored.
	 * To resume to the recording state, just call the start() method again.
	 * It is also still possible to stop() or cancel() a record,
	 * and you have to do so upstream if you wish to start a new one.
	 *
	 * @chainable
	 */
	pause() {
		return this._sendCommandToProcessor( 'pause' );
	}


	/**
	 * Stop the recording process and fire the record to the user.
	 *
	 * Depending of the configuration, this method could discard the record
	 * if it fails some quality controls (duration and saturation).
	 *
	 * To start a new record afterwards, just call the start() method again.
	 *
	 * @param {Boolean} [cancelRecord] (optional) If set to true, cancel and discard the record in any cases.
	 * @chainable
	 */
	stop( cancelRecord ) {
		if ( cancelRecord === true ) {
			this.cancel();
		}
		else {
			return this._sendCommandToProcessor( 'stop' );
		}
	}


	/**
	 * Stop a recording, but without saving the record.
	 * @chainable
	 */
	cancel() {
		return this._sendCommandToProcessor( 'cancel' );
	}


	/**
	 * Toggle between the recording and stopped state.
	 * @chainable
	 */
	toggle() {
		return this._sendCommandToProcessor( 'toggle' );
	}


	/**
	 * Attach a handler function to a given event.
	 *
	 * @param {String} [event] Name of an event.
	 * @param {Function} [handler] A function to execute when the event is triggered.
	 * @chainable
	 */
	on( event, handler ) {
		if ( event in this._eventHandlers ) {
			this._eventHandlers[ event ].push( handler );
		}

		// For one-time events, re-fire it if it already occured
		if ( event in this._eventStorage && this._eventStorage[ event ] !== null ) {
			handler( this._eventStorage[ event ] );
		}

		return this;
	}


	/**
	 * Remove all the handler function from an event.
	 *
	 * @param {String} [event] Name of an event.
	 * @chainable
	 */
	off( event ) {
		if ( event in this._eventHandlers ) {
			this._eventHandlers[ event ] = [];
		}

		return this;
	}


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
	connectAudioNode( node ) {
		var wasConnected = this._isConnected;
		if ( this._isConnected ) {
			this._disconnect();
		}
		this._extraAudioNodes.push( node );
		if ( wasConnected ) {
			this._connect();
		}
		return this;
	}


	/**
	 * Remove an extra AudioNode
	 *
	 * Note that it can produce a little interrupt in the record if you are in
	 * listening or recording state.
	 *
	 * @param {AudioNode} [node] Node to disconnect from the recording context.
	 * @chainable
	 */
	disconnectAudioNode( node ) {
		for ( let i = 0; i < this._extraAudioNodes.length; i++ ) {
			if ( node === this._extraAudioNodes[ i ] ) {
				let wasConnected = this._isConnected;
				if ( this._isConnected ) {
					this._disconnect();
				}
				this._extraAudioNodes.splice( i, 1 );
				if ( wasConnected ) {
					this._connect();
				}
				break;
			}
		}
		return this;
	}


	/**
	 * Cleanly stop the threaded execution of the audio recorder in preparation
	 * for the destruction of the current LinguaRecorder instance.
	 * 
	 * This method has to be called, otherwise memory leak will happend.
	 *
	 * @chainable
	 */
	close() {
		if ( this.processor === null ) {
			return;
		}

		// Remove all event handlers
		this.off( 'ready' )
			.off( 'readyFail' )
			.off( 'started' )
			.off( 'listening' )
			.off( 'recording' )
			.off( 'saturated' )
			.off( 'paused' )
			.off( 'stoped' )
			.off( 'canceled' );
		this._eventStorage = {};

		// Tell the RecordingProcessor it has to stop
		this._sendCommandToProcessor( 'close' );

		// Disconnect all audio nodes
		this._disconnect();

		// Properly delete the processor node
		this.processor.port.onmessage = null;
		this.processor.port.close();
		this.processor = null;

		return this;
	}


	/**
	 * Send a message to the Recording Processor to change it's behaviour.
	 * 
	 * @param {String} [command] Name of the command to send.
	 * @param {Object} [extra] (optional) Any extra data to send with the command.
	 * @chainable
	 * @private
	 */
	_sendCommandToProcessor( command, extra ) {
		if ( this.processor !== null ) {
			this.processor.port.postMessage( { message: command, extra: extra } );
		}
		return this;
	}


	/**
	 * Fire a give event to all the registred handlers functions.
	 *
	 * For one-time events (ready, readyFail), stores the firered value
	 * to be able to re-fire it for listners that are registered later
	 *
	 * @param {String} [event] Name of the event to fire.
	 * @param {Object|Array|String|Number} [value] (optional) Bounds if valid.
	 * @private
	 */
	_fire( event, value ) {
		if ( event in this._eventHandlers ) {
			for ( let i = 0; i < this._eventHandlers[ event ].length; i++ ) {
				this._eventHandlers[ event ][ i ]( value );
			}
		}

		if ( event in this._eventStorage ) {
			this._eventStorage[ event ] = value;
		}
	}


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
	async _getAudioStream() {
		// TODO: benefit from the MediaTrackConstraints when geting the stream https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints#instance_properties
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({audio: true, video:false})
		}
		catch (error) {
			this._fire( 'readyFail', error );
			return;
		}

		await this._initStream();
		this._fire( 'ready', this.stream );
	}


	/**
	 * Called once we got a MediaStream. Create an AudioContext and
	 * some needed AudioNode.
	 *
	 * for more details: https://developer.mozilla.org/fr/docs/Web/API/AudioNode
	 *
	 * @private
	 */
	async _initStream() {
		this.audioContext = new window.AudioContext();
		this.audioInput = this.audioContext.createMediaStreamSource( this.stream );

		// We load our AudioWorkletProcessor module as a blob url containing a stringified IIFE code
		// instead of givng a traditional url, because we don't know here the path at which
		// the RecordingProcessor.js file will be accessible
		const blob = new Blob([`(${recordingProcessorEncapsulation})()`], { type: "application/javascript; charset=utf-8" });
		await this.audioContext.audioWorklet.addModule(URL.createObjectURL(blob));

		this.recordProcessorConfig.sampleRate = this.audioContext.sampleRate;
		this.processor = new AudioWorkletNode( this.audioContext, 'recording-processor', { processorOptions: this.recordProcessorConfig } );

		this.processor.port.onmessage = (event) => {
			switch ( event.data.message ) {
				case 'started':
					this._state = STATE.recording;
					this._duration = 0;
					this._fire( 'started' );
					break;
				case 'listening':
					this._state = STATE.listening;
					this._duration = 0;
					this._fire( 'listening', event.data.samples );
					break;
				case 'recording':
					this._state = STATE.recording;
					this._duration = event.data.duration;
					this._fire( 'recording', event.data.samples );
					break;
				case 'saturated':
					this._fire( 'saturated' );
					break;
				case 'paused':
					this._state = STATE.paused;
					this._fire( 'paused' );
					break;
				case 'stoped':
					this._state = STATE.stop;
					this._duration = 0;
					this._disconnect();
					this._fire( 'stoped', new AudioRecord( event.data.record, this.audioContext.sampleRate ) );
					break;
				case 'canceled':
					this._state = STATE.stop;
					this._duration = 0;
					this._disconnect();
					this._fire( 'canceled', event.data.reason );
					break;
			}
		};
	}


	/**
	 * Connect the audioInput node to the processor node.
	 *
	 * If some AudioNodes are set through the connectAudioNode() method,
	 * it connect them also in between.
	 *
	 * @private
	 */
	_connect() {
		if ( this._isConnected ) {
			return;
		}

		var currentNode = this.audioInput;
		for ( let i = 0; i < this._extraAudioNodes.length; i++ ) {
			currentNode.connect( this._extraAudioNodes[ i ] );
			currentNode = this._extraAudioNodes[ i ];
		}
		currentNode.connect( this.processor );
		
		this._isConnected = true;
	}


	/**
	 * Disconnect the audioInput node from the currently connected processor node.
	 *
	 * @private
	 */
	_disconnect() {
		if ( ! this._isConnected ) {
			return;
		}
		
		this.audioInput.disconnect();
		for ( let i = 0; i < this._extraAudioNodes.length; i++ ) {
			this._extraAudioNodes[ i ].disconnect();
		}
		this.processor.disconnect();
		
		this._isConnected = false;
	}
}

