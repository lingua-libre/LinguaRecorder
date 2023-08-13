# Description
LinguaRecorder is a fast cross-browser voice recording JS library.

### Features
* Easily record your users directly from their browser (no software/plugin/whatsoever needed)
* Both desktop and mobile friendly
* Fully configurable
* Intelligent cutting to avoid blanks at the start/end of a record
* Saturation control to cancel/discard bad records
* Whole bunch of events allowing you to asynchronousely manage your user's actions
* Wide possibilities for exporting your records, including:
  * Play in browser
  * Direct download
  * WAV-encoded Blob (to send to an API for exemple)
  * URL object
* ...

### Browser Compatibility
Tested in the following browsers/versions:

|                     | master branch | legacy branch |
|---------------------|---------------|---------------|
| Firefox             | 76+           | 25+           |
| Chrome              | 66+           | 22+           |
| Firefox for androïd | 79+           | 57+ *         |
| Chrome for androïd  | 66+           | 63+ *         |
| Microsoft Edge      | 79+           | 12+           |
| Safari              | 14.1+         | 11+           |
| Opera               | 53+           | 18+           |

It may work on older versions of the browsers marked with \*, but it has not been tested.

The _master branch_ uses internaly the new [AudioWorklet API](https://developer.mozilla.org/fr/docs/Web/API/AudioWorklet), whereas the _legacy branch_ uses the old and now deprecated [BaseAudioContext:createScriptProcessor method](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createScriptProcessor).

### Live demos
The [LinguaRecorder sandbox](https://lingua-libre.github.io/LinguaRecorder/demo/sandbox.html) allows you to get familiar with (hardly) all features of the library, and to play with it's configuration possibilities.

The demo folder contain several other implementation examples.

# Documentation

### Contents
* [Quick Start](#quick-start)
* [Examples](#examples)
* [LinguaRecorder](#linguarecorder)
  * [Configurations](#configurations)
  * [Methods](#methods)
  * [Events](#events)
  * [States](#states)
* [AudioRecord](#audiorecord)
* [License](#license)

### Quick Start
Get the code:
* Clone github repository: `git clone https://github.com/lingua-libre/LinguaRecorder.git`
* Install with [npm](https://www.npmjs.com/package/lingua-recorder): `npm install lingua-recorder`
* Use a CDN: _todo_

Then include the three files stored in the src folder in your HTML page:
```html
<script src="/path/to/RecordingProcessor.js"></script>
<script src="/path/to/AudioRecord.js"></script>
<script src="/path/to/LinguaRecorder.js"></script>
<script>
    var recorder = new LinguaRecorder();
    ...
</script>
```

### Examples
_to do_

## LinguaRecorder
### Configurations

##### autoStart `boolean` `false`
Set to true to wait for voice detection before effectively starting the record when calling the start() method.

##### autoStop `boolean` `false`
Set to true to stop the record when there is a silence.

##### bufferSize `number` `4096`
Set the size of the samples buffers. Could be 0 (let the browser choose the best one) or one of the following values: 256, 512, 1024, 2048, 4096, 8192, 16384; the less the more precise, the higher the more efficient.

##### timeLimit `number` `0`
Maximum time (in seconds) after which it is necessary to stop recording. Set to 0 (default) for no time limit.

##### onSaturate `string` `'none'`
Tell what to do when a record is saturated. Accepted values are _'none'_ (default), _'cancel'_ and _'discard'_.

##### saturationThreshold `number` `0.99`
Amplitude value between 0 and 1 included. Only used if onSaturate is different from _'none'_. Threshold above which a record should be flagged as saturated.

##### startThreshold `number` `0.1`
Amplitude value between 0 and 1 included. Only used if autoStart is set to _true_. Amplitude to reach to auto-start the recording.
      
##### stopThreshold `number` `0.05`
 Amplitude value between 0 and 1 included. Only used if autoStop is set to _true_. Amplitude not to exceed in a stopDuration interval to auto-stop recording.
 
##### stopDuration `number` `0.3`
Duration value in seconds. Only used if autoStop is set to true. Duration during which not to exceed the stopThreshold in order to auto-stop recording.

##### marginBefore `number` `0.25`
Duration value in seconds. Only used if autoStart is set to _true_.

##### marginAfter `number` `0.25`
Duration value in seconds. Only used if autoStop is set to _true_.

##### minDuration `number` `0.15`
Duration value in seconds. Discard the record if it last less than minDuration. Default value to _0.15_, use _0_ to disable.

### Methods
#### constructor([config])
Creates a new LinguaRecorder instance.

* __config__: `Object` `optional` Configuration options as described aboe.
* __⇒__ `this`

#### start()
Start to record.

If _autoStart_ is set to true, enter in listening state and postpone the start of the recording when a voice will be detected.

* __⇒__ `this`

#### pause()
Switch the record to the pause state.

While in pause, all the inputs comming from the microphone will be ignored. To resume to the recording state, just call the start() method again. It is also still possible to stop() or cancel() a record, and you have to do so upstream if you wish to start a new one.

* __⇒__ `this`

#### stop([cancelRecord])
Stop the recording process and fire the record to the user.

Depending of the configuration, this method could discard the record if it fails some quality controls (duration and saturation).

To start a new record afterwards, just call the _start()_ method again.

* __cancelRecord__: `boolean` `optional` If set to _true_, cancel and discard the record in any cases.
* __⇒__ `this`

#### cancel()
Stop a recording, but without saving the record. This is an alias for `stop( true )`.

* __⇒__ `this`

#### toggle()
Toggle between the recording and stopped state.

* __⇒__ `this`

#### on(event, handler)
Attach a handler function to a given event.

* __event__: `string` Name of an event. See the dedicated section for a list of all the events available.
* __handler__: `function` A function to execute when the event is triggered.
* __⇒__ `this`

#### off(event)
Remove all the handler function from an event.

* __event__: `string` Name of an event. See the dedicated section for a list of all the events available.
* __⇒__ `this`

#### connectAudioNode(node)
Add an extra AudioNode

This can be used to draw a live visualisation of the sound, or to perform some live editing tasks on the stream before it is recorded. See https://developer.mozilla.org/fr/docs/Web/API/AudioNode

Note that it can produce a little interrupt in the record if you are in listening or recording state.

* __node__: `AudioNode` Node to connect inside the recording context.
* __⇒__ `this`

#### disconnectAudioNode(node)
Remove an extra AudioNode previously added with _connectAudioNode_.

Note that it can produce a little interrupt in the record if you are in listening or recording state.

* __node__: `AudioNode` Node to disconnect from the recording context.
* __⇒__ `this`

#### getRecordingTime()
Return the current duration of the record.

* __⇒__ `number` The duration in seconds

#### getState()
Return the current state of the recorder.

* __⇒__ `string` One of the following: 'stop', 'listening', 'recording', 'paused'

#### getAudioContext()
Return the audioContext initialised and used by the recorder.

see https://developer.mozilla.org/fr/docs/Web/API/AudioContext

* __⇒__ `AudioContext` The AudioContext object used by the recorder.

#### close()
Cleanly stop the threaded execution of the audio recorder in preparation for the destruction of the current LinguaRecorder instance.
This method has to be called, otherwise memory leak will happend.

* __⇒__ `this`

### Events
* __ready__: `MediaStream` The user has allowed your script to use the microphone, the recorder is ready to start a record.
* __readyFail__: `DOMException` Something got wrong during the initialisation; maybe the user has no microphone, or he has not allowed you to use it. For the full exceptions list, see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#Exceptions.
* __started__: A record has just started; or to say it differently the recorder switched to the _record_ state.
* __recording__: `Float32Array` Firered when in the _record_ state, each time it has N new samples available (N = `bufferSize`); the given parameter is an array containing those new samples.
* __listening__: `Float32Array` Same as the _recording_ event, but when the recorder is in the _listen_ state.
* __saturated__: Fired each time the record get saturated.
* __paused__: The record has just being paused; or to say it differently the recorder switched to the _pause_ state.
* __stoped__: `AudioRecord` The record has just being stopped; or to say it differently the recorder switched to the _stop_ state. It includes a reference to an AudioRecord, containing the stopped record.
* __canceled__: `string` The record has just being canceled, the `string` contains the reason of the cancelation, one of the following: _'asked'_, _'saturated'_ (when `onSaturate` is set to _'cancel'_), _'tooShort'_ (when `minDuration` is not reached).


### States
* __stop__: `default` Not recording yet, what are you waiting?
* __listen__: You've hit start, but you've not sepaken yet, it's time to do so! (only when `autoStart` is _true_)
* __record__: Currently recording. That's amazing, isn't it?
* __pause__: It was recording, but a dog just walked in so you paused the record the time to kick it away, but you wish to finish it later.

## AudioRecord
### Methods
#### constructor(samples, sampleRate)
Creates a new AudioRecord instance.

* __samples__: `Float32Array` The raw samples that will make up the record.
* __sampleRate__: `Number` Rate at witch the samples added to this object should be played.
* __⇒__ `this`

#### setSampleRate(value)
Change the declared sample rate.

* __value__: `Number` new sample rate to set.

#### getSampleRate()
Get the sample rate in use.
* __⇒__ `Number` Sample rate of the record.

#### getLength()
Get the total number of samples in the record.
* __⇒__ `Number` Number of samples.

#### getDuration()
Get the duration of the record.
This is based on the number of samples and the declared sample rate.

* __⇒__ `Number` Duration (in seconds) of the record.

#### getSamples()
Get all the raw samples that make up the record.

* __⇒__ `Float32Array` List of all samples.

#### ltrim(duration)
Trim the record, starting with the beginning of the record (the left side).

* __duration__: `Number` duration (in seconds) to trim.

#### rtrim(duration)
Trim the record, starting with the end of the record (the right side).

* __duration__: `Number` duration (in seconds) to trim.

#### clear()
Clear the record.

#### play()
Play the record to the audio output (aka the user's loudspeaker).

#### getBlob()
Get a WAV-encoded Blob version of the record.

* __⇒__ `Blob` WAV-encoded audio record.

#### getWAVE()
_Alias of getBlob()_

#### getObjectURL()
Generate an object URL representing the WAV-encoded record.
For performance reasons, you should unload the objectURL once you're done with it, see https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL

* __⇒__ `DOMString` URL representing the record.

#### download(fileName)
Start the download process of the record as if it where a normal file.

* __fileName__: `String` `optional` name of the file that will be downloaded, default to 'record.wav'.

#### getAudioElement()
Generate an HTML5 `<audio>` element containing the WAV-encoded record.

* __⇒__ `HTMLElement` audio element containing the record.


### Licence
The LinguaRecorder was originaly a part of [LinguaLibre](https://lingualibre.fr), developped by Nicolas Vion ([@zmoostik](https://github.com/zmoostik)), but has then been splitted out and completely rewritten by Antoine Lamielle ([@0x010C](https://github.com/0x010C)).

Released under the [MIT License](https://github.com/lingua-libre/LinguaRecorder/blob/master/LICENSE).
