( function ( mw, OO, ve ) {
	'use strict';
	mw.veForAll = mw.veForAll || {
		ui: {}
	};

	/**
	 * Inherits from the standard VE target.
	 *
	 * @class
	 * @extends ve.init.sa.Target
	 */
	mw.veForAll.Target = function ( node, content ) {
		var config = {};
		config.toolbarConfig = {};
		config.toolbarConfig.actions = true;
		// disable floatable behavior.
		config.toolbarConfig.floatable = false;

		this.$node = node;

		this.toolbarAutoHide = true;
		this.toolbarPosition = 'bottom';

		if ( node.hasClass( 'toolbarOnTop' ) ) {
			console.log( 'toolbarOnTop' );
			this.toolbarPosition = 'top';
			this.toolbarAutoHide = false;
			config.toolbarConfig.floatable = true;
		}

		mw.veForAll.Target.parent.call( this, config );

		// HACK: stop VE's education popups from appearing (T116643)
		this.dummyToolbar = true;

		this.init( content );
	};

	OO.inheritClass( mw.veForAll.Target, ve.init.sa.Target );

	mw.veForAll.Target.prototype.init = function ( content ) {
		this.convertToHtml( content );
	};

	// Static

	mw.veForAll.Target.static.name = 'veForAll';

	mw.veForAll.Target.static.toolbarGroups = ( function () {
		var toolbarConfig = JSON.parse( JSON.stringify( mw.config.get( 'VEForAllToolbarNormal' ) ) );
		return toolbarConfig.map( function ( x ) {
			if ( 'header' in x ) {
				x.header = OO.ui.deferMsg( x.header );
			}
			if ( 'title' in x ) {
				x.title = OO.ui.deferMsg( x.title );
			}
			return x;
		} );
	}() );

	mw.veForAll.Target.static.actionGroups = [
		{ include: [ 've4aSwitchEditor' ] }
		/*{
		 type: 'list',
		 icon: 'textStyle',
		 indicator: 'down',
		 title: OO.ui.deferMsg( 'visualeditor-toolbar-style-tooltip' ),
		 include: [ 'bold', 'italic' ],
		 forceExpand: [ 'bold', 'italic' ]
		 },*/
		// { include: [ 'link' ] }
	];

	// Allow pasting links
	mw.veForAll.Target.static.importRules = ve.copy( mw.veForAll.Target.static.importRules );
	mw.veForAll.Target.static.importRules.external.blacklist = OO.simpleArrayDifference(
			mw.veForAll.Target.static.importRules.external.blacklist,
			[ 'link/mwExternal' ]
		);

	// Static methods
	mw.veForAll.Target.static.setSwitchable = function ( switchable ) {
		// FIXME this isn't supposed to be a global state thing, it's supposed to be
		// variable per EditorWidget instance

		if ( switchable ) {
			mw.veForAll.Target.static.actionGroups = [ {
					type: 'list',
					icon: 'edit',
					title: mw.msg( 'visualeditor-mweditmode-tooltip' ),
					include: [ 'editModeVisual', 'editModeSource' ]
				} ];
		} else {
			mw.veForAll.Target.static.actionGroups = [];
		}
	};

	/**
	 * Add listener to show or hide toolbar if the area gets or loses focus.
	 */
	mw.veForAll.Target.prototype.setPulloutToolbar = function () {
		var target = this;
		this.getSurface().getView().on( 'blur', function ( data ) {
			target.updateToolbarVisibility();
		} );
		this.getSurface().getView().on( 'focus', function ( data ) {
			target.updateToolbarVisibility();
		} );
		this.updateToolbarVisibility();
	};

	/**
	 * Hide toolbar if area not focused (VE area or textarea ).
	 */
	mw.veForAll.Target.prototype.updateToolbarVisibility = function () {
		if ( !this.toolbarAutoHide ) {
			return;
		}
		if ( $( this.$node ).closest( '.ve-area-wrapper' ).find( ':focus' ).length > 0 ) {
			this.getToolbar().$element.show( 500 );
		} else {
			this.getToolbar().$element.hide( 500 );
		}
	};

	/**
	 * Create a new surface with VisualEditor, and add it to the target.
	 *
	 * @param {string} content text to initiate content, in html format
	 */
	mw.veForAll.Target.prototype.createWithHtmlContent = function ( content ) {
		var target = this,
			$focusedElement = $( ':focus' ),
			surface = this.addSurface(
				ve.dm.converter.getModelFromDom(
					ve.createDocumentFromHtml( content )
				)
			);
		// this.setSurface( surface );
		// this.$element.insertAfter( this.$node );

		// Append the target to the document
		$( this.$node ).before( this.$element );

		$( this.$node ).hide()
			.removeClass( 'oo-ui-texture-pending' )
			.prop( 'disabled', false );

		// When editor loses focus, update the field input.
		this.getSurface().getView().on( 'blur', function ( data ) {
			target.updateContent();
		} );
		this.getSurface().on( 'switchEditor', function ( data ) {
			console.log( 'switchEditor event' );
			target.switchEditor();
		} );

		// show or hide toolbar when lose focus
		// this.getSurface().getView().on( 'blur', function (data) {
		// 	target.updateToolbarVisibility();
		// } );
		this.getSurface().getView().on( 'focus', function ( data ) {
			target.updateToolbarVisibility();
		} );
		target.updateToolbarVisibility();

		// focus VE instance if textarea had focus
		if ( $focusedElement.length && this.$node.is( $focusedElement ) ) {
			this.getSurface().getView().focus();
		}

		// fix BUG on initialisation of toolbar position :
		target.getToolbar().onWindowResize();
		target.onToolbarResize();
		target.onContainerScroll();
	};

	/**
	 * Update the original textarea value with the content of VisualEditor
	 * surface (convert the content into wikitext)
	 */
	mw.veForAll.Target.prototype.updateContent = function () {
		var surface = this.getSurface();
		if ( surface !== null ) {
			this.convertToWikiText( surface.getHtml() );
		}
	};

	mw.veForAll.Target.prototype.getPageName = function () {
		return mw.config.get( 'wgPageName' ).split( /(\\|\/)/g ).pop();
	};

	mw.veForAll.Target.prototype.convertToWikiText = function ( content ) {
		var target = this,
			oldFormat = 'html',
			newFormat = 'wikitext',
			apiCall;

		$( this.$node )
			.prop( 'disabled', true )
			.addClass( 'oo-ui-texture-pending' );

		apiCall = new mw.Api().post( {
			action: 'veforall-parsoid-utils',
			from: oldFormat,
			to: newFormat,
			content: content,
			title: this.getPageName()
		} ).then( function ( data ) {
			$( target.$node ).val( data[ 'veforall-parsoid-utils' ].content );
			$( target.$node ).change();

			$( target.$node )
					.removeClass( 'oo-ui-texture-pending' )
					.prop( 'disabled', false );
		} )
				.fail( function ( data ) {
					console.log( 'Error converting to wikitext' );
				} );

	};

	mw.veForAll.Target.prototype.convertToHtml = function ( content ) {
		var target = this,
			oldFormat = 'wikitext',
			newFormat = 'html',
			apiCall;

		apiCall = new mw.Api().post( {
			action: 'veforall-parsoid-utils',
			from: oldFormat,
			to: newFormat,
			content: content,
			title: this.getPageName()
		} ).then( function ( data ) {
			target.createWithHtmlContent( data[ 'veforall-parsoid-utils' ].content );
		} ).fail( function ( data ) {
			console.log( 'Error converting to html' );
		} );
	};

	mw.veForAll.Target.prototype.switchEditor = function ( content ) {
		var textarea = this.$node;

		if ( $( textarea ).is( ':visible' ) ) {
			// switch back to VE
			this.clearSurfaces();
			$( textarea ).hide();
			// $(this.getSurface().$element).show();
			// this.getSurface().getView().focus();
			this.convertToHtml( $( textarea ).val() );
			$( textarea ).parent().find( '.oo-ui-icon-eye' )
				.removeClass( 'oo-ui-icon-eye' )
				.addClass( 'oo-ui-icon-wikiText' );
			$( textarea ).parent().find( '.oo-ui-tool-link' )
				.attr( 'title', OO.ui.deferMsg( 'veforall-switch-editor-tool-title' ) );
		} else {
			$( textarea ).parent().find( '.oo-ui-icon-wikiText' )
				.removeClass( 'oo-ui-icon-wikiText' )
				.addClass( 'oo-ui-icon-eye' );
			$( textarea ).parent().find( '.oo-ui-tool-link' )
				.attr( 'title', OO.ui.deferMsg( 'visualeditor-welcomedialog-switch-ve' ) );
			// Switch to text editor
			$( this.getSurface().$element ).hide();
			$( textarea ).show().focus();
			this.updateContent();
		}
	};

	/**
	 * Attach the toolbar to the DOM
	 * redifine attach Toolbar function to place on the bottom
	 */
	mw.veForAll.Target.prototype.attachToolbar = function ( surface ) {
		var toolbar = this.getToolbar();

		if ( this.toolbarPosition == 'top' ) {
			toolbar.$element.insertBefore( toolbar.getSurface().$element );
		} else {
			$( this.$node ).after( toolbar.$element );
		}
		toolbar.initialize();
		this.getActions().initialize();
	};

	// Registration
	ve.init.mw.targetFactory.register( mw.veForAll.Target );

}( mediaWiki, OO, ve ) );
