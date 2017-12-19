'use strict';

/*
 TODO
 - Propriser
 - Documenter
 - Allow on-the-fly word addition
*/

var WordListStudio = function( config ) {
	config = config || {};
	config.recorder = { 'autoStart': true, 'autoStop': true, 'onSaturate': 'discard' };
    Studio.call( this, config );

    var studio = this;
    this.currentWord = { text: null, index: null, $word: null };
    this.amplitudeCanvas = this.$element.find( '.studio-wordcanvas' ).detach().removeClass( 'hidden' )[ 0 ];
    this.amplitudeCtx = this.amplitudeCanvas.getContext('2d');
    this.amplitudeValues = [];

    // Initialise the word list
    config.words = config.words || [];
    var $wordListElement = this.$element.find( '.studio-wordlist' );
    for ( var i = 0; i < config.words.length; i++ ) {
        $wordListElement.append( $( '<li>' ).text( config.words[ i ] ) );
    }

    // Switch to the selected word when the user clicks on an item
    this.$element.find( '.studio-wordlist li' ).click( function() {
        studio.setCurrentWord( $( this ) );
    } );

    // Select
    if ( $wordListElement.find( 'li' ).length > 0 ) {
        this.setCurrentWord( $wordListElement.find( 'li' ).eq( 0 ) );
    }
};
$.extend( WordListStudio.prototype, Studio.prototype )


WordListStudio.prototype.onStart = function() {
    Studio.prototype.onStart.call( this );

    requestAnimationFrame( this.drawAmplitude.bind( this ) );
};

WordListStudio.prototype.onStop = function() {
    Studio.prototype.onStop.call( this );

    // Send the record to the API
    var $word = this.currentWord.$word;
    $word.addClass( 'studio-wordlist-waiting' );
    //TODO: send it to the API
    setTimeout( function() {
        $word.removeClass( 'studio-wordlist-waiting' );
        $word.addClass( 'studio-wordlist-success' );
    }, 1500 );

    // Clear the Amplitude chart
    this.amplitudeCtx.clearRect( 0, 0, this.amplitudeCanvas.width, this.amplitudeCanvas.height );

    // Switch to the next word, if there is one
    var $next = this.$element.find( '.studio-wordlist li' ).eq( this.currentWord.index + 1 );
    if ( $next.length === 1 ) {
        this.setCurrentWord( $next );
        this.recorder.start();
    }
    else {
        this.$element.find( '.studio-head' ).removeClass( 'studio-rec' );
    }
};

WordListStudio.prototype.onCancel = function( reason ) {
    Studio.prototype.onCancel.call( this );

    // Clear the Amplitude chart
    this.amplitudeValues = [];
    this.amplitudeCtx.clearRect( 0, 0, this.amplitudeCanvas.width, this.amplitudeCanvas.height );

    if ( reason !== 'asked' ) {
        // Make the curent word element blink for 0.5s in red to warn that it has been canceled
        var $word = this.currentWord.$word;
        $word.addClass( 'studio-wordlist-error' );
        setTimeout( function() {
            $word.removeClass( 'studio-wordlist-error' );
        }, 500 );

        // Restart a new recording of the same word
        this.recorder.start();
    }
};

WordListStudio.prototype.onSaturate = function() {
    this.currentWord.$word.addClass( 'studio-wordlist-error' );
};

WordListStudio.prototype.onRecord = function( samples ) {
    Studio.prototype.onRecord.call( this );

    var amplitudeMax = 0;
    for ( var i=0; i < samples.length; i++ ) {
        var amplitude = Math.abs( samples[ i ] );
        if ( amplitude > amplitudeMax ) {
            amplitudeMax = amplitude;
        }
    }

    this.amplitudeValues.push( amplitudeMax );

    if ( this.amplitudeValues.length > this.nbMaxAmplitudeBars ) {
        this.amplitudeValues.shift();
    }
};

WordListStudio.prototype.setCurrentWord = function( $word ) {
    if ( this.currentWord.$word !== null ) {
        this.currentWord.$word.removeClass( 'studio-wordlist-selected' );
    }

    if ( this.isRecording ) {
        this.recorder.cancel();
        this.recorder.start();
    }

    var index = this.$element.find( '.studio-wordlist li' ).index( $word );
    this.currentWord = { $word: $word, text: $word.text(), index: index };

    $word.addClass( 'studio-wordlist-selected' );

    this.amplitudeValues = [];
    $word.prepend( this.amplitudeCanvas );
    this.amplitudeCanvas.width = $word.outerWidth();
    this.amplitudeCanvas.height = $word.outerHeight();
    this.nbMaxAmplitudeBars = Math.floor( this.amplitudeCanvas.width / 5 );
};



WordListStudio.prototype.drawAmplitude = function() {
    if ( ! this.isRecording ) {
        return;
    }

    // Clear the current content of the canvas
    this.amplitudeCtx.clearRect(0, 0, this.amplitudeCanvas.width, this.amplitudeCanvas.height);

    // Draw the amplitude chart
    this.amplitudeCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    for (var i = 0; i < this.amplitudeValues.length; i++){
        var height = Math.ceil( this.amplitudeValues[ i ] * this.amplitudeCanvas.height )
        this.amplitudeCtx.fillRect(i * 5, this.amplitudeCanvas.height - height, 5, height );
	}

    // Ask the browser to callback this function at its next refresh
    requestAnimationFrame( this.drawAmplitude.bind( this ) );
}


WordListStudio.prototype.onRecordingButtonClick = function() {
    if ( this.recorder.getState() !== 'stop' ) {
        this.$element.find( '.studio-head' ).removeClass( 'studio-rec' );
        this.recorder.cancel();
    }
    else {
        this.recorder.start();
        this.$element.find( '.studio-head' ).addClass( 'studio-rec' );
    }
};
