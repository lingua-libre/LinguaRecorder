'use strict';

// This function is only used to encapsulate the code, so that it can be
// stringified, put in an objectURL and loaded as a Worklet module
// from within the LinguaRecorder without having to know the path of this file.
function recordingProcessorEncapsulation() {
	const STATE = {
		stop: 'stop',
		listening: 'listen',
		recording: 'record',
		paused: 'pause',
	};


	/**
	 * @class AudioSamples
	 * Internal class used to store and manage a set of audio samples
	 * during the creation of an audio recording.
	 * 
	 * @private
	 */
	class AudioSamples {

		/**
		 * Creates a new AudioSamples instance.
		 * 
		 * @param {Number} [sampleRate] Rate at which the samples added to this object should be played
		 */
		constructor( sampleRate ) {
			this.sampleRate = sampleRate;
			this.sampleBlocs = [];
			this.length = 0;
		}


		/**
		 * Add some raw samples to the record.
		 *
		 * @param {Float32Array} [samples] samples to append to the record
		 * @param {Number} [rollingDuration=0] (optional) if set, last number of seconds of the record to keep after adding the new samples
		 * @return {Number} the new total number of samples stored.
		 */
		push( samples, rollingDuration ) {
			this.length += samples.length;
			this.sampleBlocs.push( samples );

			if ( rollingDuration !== undefined ) {
				let duration = this.getDuration();
				if ( duration > rollingDuration ) {
					this.lTrim( duration - rollingDuration );
				}
			}

			return this.length;
		}


		/**
		 * Get all the raw samples that make up the record.
		 *
		 * @return {Float32Array} list of all samples.
		 */
		get() {
			var flattened = new Float32Array( this.length ),
				nbBlocs = this.sampleBlocs.length,
				offset = 0;

			for ( let i = 0; i < nbBlocs; ++i ) {
				flattened.set( this.sampleBlocs[ i ], offset );
				offset += this.sampleBlocs[ i ].length
			}

			return flattened;
		}


		/**
		 * Get the duration of the record.
		 * This is based on the number of samples and the declared sample rate.
		 *
		 * @return {Number} duration (in seconds) of the record.
		 */
		getDuration() {
			return this.length / this.sampleRate;
		}


		/**
		 * Trim the record, starting with the beginning of the record (the left side).
		 *
		 * @param {Number} [duration] duration (in seconds) to trim
		 */
		lTrim( duration ) {
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
				this.sampleBlocs[ 0 ] = this.sampleBlocs[ 0 ].subarray( nbSamplesToRemove );
			}
		}


		/**
		 * Trim the record, starting with the end of the record (the right side).
		 *
		 * @param {Number} [duration] duration (in seconds) to trim
		 */
		rTrim( duration ) {
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
				let lastIndex = this.sampleBlocs.length - 1;
				this.sampleBlocs[ lastIndex ] = this.sampleBlocs[ lastIndex ].subarray( 0, this.sampleBlocs[ lastIndex ].length - nbSamplesToRemove );
			}
		}
	}



	/**
	 * @class RecordingProcessor
	 * @extends AudioWorkletProcessor
	 * Internal class used to do the audio recording process
	 * on the Web Audio rendering thread
	 * see https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor
	 * 
	 * @private
	 */
	class RecordingProcessor extends AudioWorkletProcessor {

	
		/**
		 * Creates a new RecordingProcessor instance
		 * It cannot be instantiated directly, it will be called internally by the creation of an associated AudioWorkletNode.
		 * see https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/AudioWorkletProcessor#syntax
		 * 
		 * @param {Object} [options] Configuration options
		 * @cfg {Boolean} [autoStart=false] Set to true to wait for voice detection when calling the start() method.
		 * @cfg {Boolean} [autoStop=false] Set to true to stop the record when there is a silence.
		 * @cfg {Number} [bufferSize=4096] Set the size of the samples buffers. Could be 0 (let the browser choose the best one) or one of the following values: 256, 512, 1024, 2048, 4096, 8192, 16384; the less the more precise, the higher the more efficient.
		 * @cfg {Number} [timeLimit=0] Maximum time (in seconds) after which it is necessary to stop recording. Set to 0 (default) for no time limit.
		 * @cfg {String} [onSaturate='none'] Tell what to do when a record is saturated. Accepted values are 'none' (default), 'cancel' and 'discard'.
		 * @cfg {Number} [saturationThreshold=0.99] Amplitude value between 0 and 1 included. Only used if onSaturate is different from 'none'. Threshold above which a record should be flagged as saturated.
		 * @cfg {Number} [startThreshold=0.1] Amplitude value between 0 and 1 included. Only used if autoStart is set to true. Amplitude to reach to auto-start the recording.
		 * @cfg {Number} [stopThreshold=0.05] Amplitude value between 0 and 1 included. Only used if autoStop is set to true. Amplitude not to exceed in a stopDuration interval to auto-stop recording.
		 * @cfg {Number} [stopDuration=0.3] Duration value in seconds. Only used if autoStop is set to true. Duration during which not to exceed the stopThreshold in order to auto-stop recording.
		 * @cfg {Number} [marginBefore=0.25] Duration value in seconds. Only used if autoStart is set to true.
		 * @cfg {Number} [marginAfter=0.25] Duration value in seconds. Only used if autoStop is set to true.
		 * @cfg {Number} [minDuration=0.15] Duration value in seconds. Discard the record if it last less than minDuration. Default value to 0.15, use 0 to disable.
		 */
		constructor( options ) {
			super();

			this.config = {
				autoStart: false,
				autoStop: false,
				timeLimit: 0,
				onSaturate: 'none',
				saturationThreshold: 0.99,
				startThreshold: 0.1,
				stopThreshold: 0.05,
				stopDuration: 0.3,
				marginBefore: 0.25,
				marginAfter: 0.25,
				minDuration: 0.15
			};
			this._isRunning = true;
			this._state = STATE.stop;
			this._audioSamples = null;
			this._silenceSamplesCount = 0;
			this._isSaturated = false;

			this._setConfig( options.processorOptions );
			this.port.onmessage = ( event ) => {
				switch ( event.data.message ) {
					case 'start':
						this._start();
						break;

					case 'pause':
						this._pause();
						break;

					case 'stop':
						this._stop();
						break;

					case 'cancel':
						this._stop( true );
						break;

					case 'toggle':
						if ( this._state === STATE.recording || this._state === STATE.listening ) {
							this.stop();
						}
						else {
							this.start();
						}
						break;

					case 'close':
						this._isRunning = false;
						break;

					case 'setConfig':
						this._setConfig( event.data.extra );
						break;
				}
			};
		}


		/**
		 * Set configuration options
		 * 
		 * @param {Object} [options] Configuration options
		 */
		_setConfig( options ) {
			this.config = {
				...this.config,
				...options
			}
		}


		/**
		 * So some preparation and switch state to start to record.
		 *
		 * If autoStart is set to true, enter in listening state and postpone the start
		 * of the recording when a voice will be detected.
		 */
		_start() {
			if ( this._state === STATE.listening || this._state === STATE.recording ) {
				return;
			}

			if ( this._state === STATE.stop ) {
				this._audioSamples = new AudioSamples( this.config.sampleRate );
				this._silenceSamplesCount = 0;
				this._isSaturated = false;

				if ( this.config.autoStart ) {
					this._state = STATE.listening;
					return;
				}
			}

			this._state = STATE.recording;
			this.port.postMessage({ message: 'started' });
		}


		/**
		 * Switch the record to the pause state.
		 */
		_pause() {
			if ( this._state === STATE.stop || this._state === STATE.paused ) {
				return;
			}

			if ( this._state === STATE.listening ) {
				this._state = STATE.stop;
			}
			else {
				this._state = STATE.paused;
			}

			this.port.postMessage({ message: 'paused' });
		}


		/**
		 * Stop the recording process and send the record to the AudioWorkletNode.
		 *
		 * Depending of the configuration, this method could discard the record
		 * if it fails some quality controls (duration and saturation).
		 * 
		 * @param {Boolean} [cancelRecord] (optional) If set to true, cancel and discard the record in any cases.
		 */
		_stop( cancelRecord ) {
			cancelRecord = false || cancelRecord;

			if ( this._state === STATE.stop ) {
				return;
			}

			if ( cancelRecord === true ) {
				this._audioSamples = null;
				this.port.postMessage({ message: 'canceled', reason: 'asked' });
			}
			else if ( ( this.config.onSaturate === 'discard' || this.config.onSaturate === 'cancel' ) && this._isSaturated ) {
				this._audioSamples = null;
				this.port.postMessage({ message: 'canceled', reason: 'saturated' });
			}
			else if ( this._audioSamples.getDuration() < this.config.minDuration ) {
				this._audioSamples = null;
				this.port.postMessage({ message: 'canceled', reason: 'tooShort' });
			}
			else {
				this.port.postMessage({ message: 'stopped', record: this._audioSamples.get() });
			}

			this._state = STATE.stop;
		}

		/**
		 * Process and save audio inputs depending of the current state of the recorder.
		 * 
		 * It will be called synchronously from the audio rendering thread,
		 * once every time a new block of audio is ready to be manipulated.
		 * see https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
		 * 
		 * @param {Array} [inputs] Array of inputs connected to the node, each containing an array of channels, each containing an Float32Array of samples.
		 * @param {Array} [outputs] Array of outputs, which structure is similar to inputs
		 * @param {Object} [parameters] unused
		 * @return {Boolean} Whether or not to force the AudioWorkletNode to remain active
		 */
		process(inputs, outputs, parameters) {
			
			// Check that there is an audio input before doing anything
			if ( inputs.length === 0 || inputs[0].length === 0 ) {
				return this._isRunning;
			}

			if ( this._state === STATE.listening ) {
				// Get the samples from the first channel of the first input available
				// and copy them in a new Float32Array, to avoid memory deallocation
				this._audioListeningProcess( new Float32Array( inputs[0][0] ) );
			}
			else if ( this._state === STATE.recording ) {
				// same as above
				this._audioRecordingProcess( new Float32Array( inputs[0][0] ) );
			}

			// Pass data directly to output, unchanged. TODO: needed?
			for ( let sample = 0; sample < inputs[0][0].length; sample++ ) {
				outputs[0][0][sample] = inputs[0][0][sample];
			}
			
			return this._isRunning; //needed to return true to keep the processor alive
		}

		/**
		 * Check whether it can auto-start recording, or store
		 * the last marginBefore seconds incoming from the microphone.
		 * 
		 * @param {Float32Array} [samples] Array of audio samples to process.
		 * @private
		 */
		_audioListeningProcess( samples ) {
			// Analyze the sound to autoStart when it should
			for ( let i = 0; i < samples.length; i++ ) {
				let amplitude = Math.abs( samples[ i ] );
				if ( amplitude > this.config.startThreshold ) {
					// start the record
					this._state = STATE.recording;
					this.port.postMessage({ message: 'started' });
					return this._audioRecordingProcess( samples );
				}
			}

			// Store the sound in the AudioRecord object
			if ( this.config.marginBefore > 0 ) {
				this._audioSamples.push( samples, this.config.marginBefore );
			}
			this.port.postMessage({ message: 'listening', samples: samples });
		}


		/**
		 * Saves the incoming audio stream from the user's microphone
		 * into the AudioSamples storage.
		 *
		 * Checks also if the incoming sound is not saturated, if the timeLimit
		 * is not reached, and if the record should auto-stop.
		 *
		 * @param {Float32Array} [samples] Array of audio samples to process.
		 * @private
		 */
		_audioRecordingProcess( samples ) {
			// Store the sound in the AudioRecord object
			this._audioSamples.push( samples );
			this.port.postMessage({ message: 'recording', samples: samples, duration: this._audioSamples.getDuration() }); //TODO: do not post messages at every loop (48000/128=375 times per seconds...)

			// Check if the samples are not saturated
			for ( let i = 0; i < samples.length; i++ ) {
				let amplitude = Math.abs( samples[ i ] );
				if ( amplitude > this.config.saturationThreshold ) {
					this.port.postMessage({ message: 'saturated' });
					this._isSaturated = true;
					if ( this.config.onSaturate === 'cancel' ) {
						this._stop();
						return;
					}
					break;
				}
			}

			// Analyze the sound to autoStop if needed
			if ( this.config.autoStop ) {
				let amplitudeMax = 0;
				for ( let i = 0; i < samples.length; i++ ) {
					let amplitude = Math.abs( samples[ i ] );
					if ( amplitude > amplitudeMax ) {
						amplitudeMax = amplitude;
					}
				}

				if ( amplitudeMax < this.config.stopThreshold ) {
					this._silenceSamplesCount += samples.length;

					if ( this._silenceSamplesCount >= ( this.config.stopDuration * this.config.sampleRate ) ) {
						this._audioSamples.rTrim( this.config.stopDuration - this.config.marginAfter );
						this._stop();
					}
				}
				else {
					this._silenceSamplesCount = 0;
				}
			}

			// If one is set, check if we have not reached the time limit
			if ( this.config.timeLimit > 0 ) {
				if ( this.config.timeLimit >= this._audioSamples.getDuration() ) {
					this._stop();
				}
			}
		}
	}

	// Register our AudioWorkletProcessor so it can be used by an AudioWorkletNode
	registerProcessor('recording-processor', RecordingProcessor);
};


// UMD pattern to support different ways of loading the library
( function ( root, factory ) {
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( [], factory );
	} else if ( typeof module === "object" && module.exports ) {
		// Node. Does not work with strict CommonJS, but
		// only CommonJS-like environments that support module.exports,
		// like Node.
		module.exports = factory();
	} else {
		// Browser globals (root is window)
		if( ! root.LinguaRecorder ) root.LinguaRecorder = {}
		root.LinguaRecorder.recordingProcessorEncapsulation = factory().recordingProcessorEncapsulation;
	}
} ( typeof self !== "undefined" ? self : this, function () {
	return { recordingProcessorEncapsulation };
} ) );
