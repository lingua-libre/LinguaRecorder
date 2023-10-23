'use strict';

/*
 TODO
 - Propriser
 - Documenter
 - Allow on-the-fly word addition
 - todo: auto-scroll
 - max-size
*/

var WordListStudio = function( config ) {
	config = config || {};
	config.recorder = { 'autoStart': true, 'autoStop': true, 'onSaturate': 'discard' };
    Studio.call( this, config );

    this.currentWord = { text: null, index: null, $word: null };
    this.amplitudeCanvas = this.$element.find( '.studio-wordCanvas' ).detach().removeClass( 'hidden' )[ 0 ];
    this.amplitudeCtx = this.amplitudeCanvas.getContext('2d');
    this.amplitudeCtx.save();
    this.amplitudeValues = [];
    this.records = [];

    // Initialize the word list
    config.words = config.words || [];
    var $wordListElement = this.$element.find( '.studio-wordlist' );
    for ( var i = 0; i < config.words.length; i++ ) {
        $wordListElement.append( $( '<li>' ).text( config.words[ i ] ) );
    }

    this.setWordsEvents();

    // Select
    if ( $wordListElement.find( 'li' ).length > 0 ) {
        this.setCurrentWord( $wordListElement.find( 'li' ).eq( 0 ) );
    }
};
$.extend( WordListStudio.prototype, Studio.prototype )


WordListStudio.prototype.setWordsEvents = function() {
    var studio = this;

    // Remove possible existing events
    this.$element.find( '.studio-wordlist li' ).off( 'click' );

    // When the user clicks on an item
    this.$element.find( '.studio-wordlist li' ).click( function() {
        // Switch to the selected word
        studio.setCurrentWord( $( this ) );

        // Play it if it has already been recorded
        studio.playCurrent();
    } );
}


WordListStudio.prototype.onStart = function() {
    Studio.prototype.onStart.call( this );

    if ( this.animate ) {
        requestAnimationFrame( this.drawAmplitude.bind( this ) );
    }
};

WordListStudio.prototype.onStop = function( audioRecord ) {
    Studio.prototype.onStop.call( this );

    // Store the audioRecord locally
    var soundId = this.records.push( audioRecord ) - 1;

    // Send the record to the API
    var $word = this.currentWord.$word;
    $word.addClass( 'studio-wordlist-waiting' );
    //TODO: send it to the API
    setTimeout( function() {
        $word.removeClass( 'studio-wordlist-waiting' );
        $word.addClass( 'studio-wordlist-success' );
        $word.attr( 'sound-id', soundId );
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
        // Make the current word element blink for 0.5s in red to warn that it has been canceled
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

    $( '.studio-wordlist' ).animate( { scrollTop: $( '.studio-wordlist' ).scrollTop() + $word.position().top }, 100 );
    $( '.studio-wordlist' ).animate( { scrollLeft: $( '.studio-wordlist' ).scrollLeft() + $word.position().left }, 100 );

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

    // Flip the graph if we're using a rtl language
    if ( this.currentWord.$word.css('direction') === 'rtl' ) {
        this.amplitudeCtx.resetTransform();
        this.amplitudeCtx.transform(-1, 0, 0, 1, this.amplitudeCanvas.width, 0);
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

WordListStudio.prototype.playCurrent = function() {
    if ( this.recorder.getState() === 'listen' ) {
        return;
    }

    var soundId = this.currentWord.$word.attr( 'sound-id' );
    if ( soundId !== undefined ) {
        this.records[ parseInt( soundId ) ].play();
    }
}
