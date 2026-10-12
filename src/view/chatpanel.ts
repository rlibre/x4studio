/**
 * @file chatpanel.ts
 * @description the chat with the assistant, as a tool of the studio
 *
 * What was said, one line after the other, and a field to say more. The
 * panel shows a conversation and types in it: what the assistant does with
 * the page is not its business (see core/assistant.ts).
 *
 * The key of the API and the model are the user's, not the project's: they
 * are kept in his browser (localStorage), never in the files of a project.
 *
 * Pictures go with a message (a mockup, a screenshot, a logo): pasted in
 * the field (Ctrl+V), dropped on the panel, or chosen with "Image...".
 * They wait above the field, where each can be taken away, and leave with
 * what is typed.
 */

import { Button, Component, FileDialog, HBox, Input, Select, SimpleTextArea, VBox } from "x4js";
import type { ComponentProps } from "x4js";

import type { Assistant, ChatEntry, ChatImage } from "../core/assistant.ts";

import "./chatpanel.scss";

/** the models that are offered: the first one is the one a new user gets */
const MODELS = [
	{ id: "claude-opus-5-5", text: "Opus 5.5" },
	{ id: "claude-sonnet-5-5", text: "Sonnet 5.5" },
];

/**
 * A picture is sent this big at most, on its longer side, in pixels: what
 * is on a screen can still be read, and the request stays light. (My
 * choice. The API takes up to 8000 pixels a side and 10 MB a picture, and
 * makes them smaller by itself: its documentation, read on 2026-10-12.)
 */
const IMAGE_SIDE = 1600;

const KEY_ITEM = "x4studio.claude.key";
const MODEL_ITEM = "x4studio.claude.model";

/** what the browser keeps for the user; it may refuse (a private window) */
function recall( item: string ): string {
	try {
		return localStorage.getItem( item ) ?? "";
	}
	catch {
		return "";
	}
}

function remember( item: string, value: string ): void {
	try {
		if( value ) {
			localStorage.setItem( item, value );
		}
		else {
			localStorage.removeItem( item );
		}
	}
	catch {
		// kept for this session only
	}
}

export interface ChatPanelProps extends ComponentProps {
	assistant: Assistant;
}

export class ChatPanel extends VBox<ChatPanelProps> {

	private assistant: Assistant;
	private key = recall( KEY_ITEM );

	private log: Component;					// what was said
	private lines = new Map<ChatEntry, Component>( );
	private setup: Component;				// asks for the key
	private keyInput: Input;
	private prompt: SimpleTextArea;
	private waiting: Component;				// the pictures that will leave with the message
	private images: ChatImage[] = [];
	private go: Button;
	private fresh: Button;
	private model: Select;

	constructor( props: ChatPanelProps ) {
		super( props );

		this.addClass( "chatpanel" );
		this.assistant = props.assistant;

		const model = recall( MODEL_ITEM );

		const picker = new FileDialog( {
			accept: "image/*",
			multiple: true,
			callback: files => { void this.addImages( Array.from( files ) ); },
		} );

		this.setContent( [
			this.log = new Component( { cls: "log", flex: 1 } ),

			// shown while there is no key
			this.setup = new HBox( {
				cls: "setup",
				content: [
					new Component( { tag: "span", content: "Your Anthropic API key:" } ),
					this.keyInput = new Input( {
						type: "password",
						flex: 1,
						placeholder: "sk-ant-...",
						dom_events: {
							keydown: ev => {
								if( ev.key === "Enter" ) {
									this.takeKey( );
								}
							},
						},
					} ),
					new Button( { label: "OK", click: ( ) => this.takeKey( ) } ),
				],
			} ),

			this.waiting = new HBox( { cls: "waiting", hidden: true } ),

			new HBox( {
				cls: "ask",
				content: [
					this.prompt = new SimpleTextArea( {
						flex: 1,
						resize: "none",
						dom_events: {
							keydown: ( ev: KeyboardEvent ) => {
								// Enter sends, with shift it is a new line
								if( ev.key === "Enter" && !ev.shiftKey && !ev.isComposing ) {
									ev.preventDefault( );
									this.send( );
								}
							},
						},
					} ),

					new VBox( {
						cls: "buttons",
						content: [
							this.go = new Button( { label: "Send", click: ( ) => this.assistant.isBusy( ) ? this.assistant.stop( ) : this.send( ) } ),
						],
					} ),
				],
			} ),

			new HBox( {
				cls: "options",
				content: [
					this.model = new Select( {
						items: MODELS,
						value: MODELS.some( m => m.id === model ) ? model : MODELS[0].id,
						change: ev => remember( MODEL_ITEM, String( ev.value ) ),
					} ),
					new Button( { cls: "outline", label: "Image...", tooltip: "A picture to send with the message: a mockup, a screenshot. It can also be pasted in the field, or dropped here.", click: ( ) => picker.showDialog( ) } ),
					new Component( { flex: 1 } ),
					this.fresh = new Button( { cls: "outline", label: "New conversation", click: ( ) => this.assistant.clear( ) } ),
					new Button( { cls: "outline", label: "Key...", tooltip: "Change the API key, or forget it", click: ( ) => this.askKey( ) } ),
				],
			} ),

			// to choose pictures: not seen
			picker,
		] );

		this.prompt.setAttribute( "placeholder", "What should the page be? (Enter sends, Shift+Enter is a new line; a picture can be pasted)" );

		// A picture that is pasted in the field, or dropped on the panel.
		// (x4 does not know these events: they are listened to directly)
		this.prompt.dom.addEventListener( "paste", ev => {
			const files = Array.from( ( ev as ClipboardEvent ).clipboardData?.files ?? [] ).filter( file => file.type.startsWith( "image/" ) );

			// a text that is pasted is left to the field
			if( files.length ) {
				ev.preventDefault( );
				void this.addImages( files );
			}
		} );

		this.dom.addEventListener( "dragover", ev => {
			ev.preventDefault( );
		} );

		this.dom.addEventListener( "drop", ev => {
			ev.preventDefault( );
			void this.addImages( Array.from( ( ev as DragEvent ).dataTransfer?.files ?? [] ).filter( file => file.type.startsWith( "image/" ) ) );
		} );

		this.assistant.listener = {
			added: entry => this.addLine( entry, true ),
			grew: entry => this.growLine( entry ),
			busy: on => this.setBusy( on ),
			reset: ( ) => this.reload( ),
		};

		this.reload( );
	}

	/**
	 * Show the conversation of the assistant again, whole: another project
	 * was opened, or the conversation was forgotten.
	 */

	private reload( ): void {
		this.lines.clear( );
		this.log.clearContent( );

		for( const entry of this.assistant.log ) {
			this.addLine( entry, false );
		}

		this.setBusy( this.assistant.isBusy( ) );
		this.toEnd( );
	}

	// :: THE KEY :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	private takeKey( ): void {
		this.key = this.keyInput.getValue( ).trim( );
		remember( KEY_ITEM, this.key );

		this.keyInput.setValue( "" );
		this.setBusy( this.assistant.isBusy( ) );

		if( this.key ) {
			this.prompt.focus( );
		}
	}

	/** the key is asked again: an empty one forgets it */
	private askKey( ): void {
		this.setup.show( true );
		this.keyInput.focus( );
	}

	// :: THE CONVERSATION ::::::::::::::::::::::::::::::::::::::::::::::::::::

	private send( ): void {
		const text = this.prompt.getText( );
		const images = this.images;

		if( ( !text && images.length === 0 ) || !this.key || this.assistant.isBusy( ) ) {
			return;
		}

		this.prompt.setText( "" );
		this.images = [];
		this.showWaiting( );

		// never throws: what goes wrong is a line of the conversation
		void this.assistant.send( text, { key: this.key, model: String( this.model.getValue( ) ) }, images );
	}

	// :: PICTURES ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * Pictures to send with the next message. Each is drawn again, not
	 * bigger than what is useful, as a PNG: whatever it was (an svg, a
	 * bitmap of any kind), the API then knows it.
	 */

	private async addImages( files: File[] ): Promise<void> {
		for( const file of files ) {
			const url = URL.createObjectURL( file );

			try {
				const image = new Image( );

				await new Promise<void>( ( resolve, reject ) => {
					image.onload = ( ) => resolve( );
					image.onerror = ( ) => reject( new Error( "not a picture" ) );
					image.src = url;
				} );

				// an svg may have no size of its own
				const width = image.naturalWidth || 512;
				const height = image.naturalHeight || 512;
				const scale = Math.min( 1, IMAGE_SIDE / Math.max( width, height ) );

				const canvas = document.createElement( "canvas" );
				canvas.width = Math.max( 1, Math.round( width * scale ) );
				canvas.height = Math.max( 1, Math.round( height * scale ) );
				canvas.getContext( "2d" ).drawImage( image, 0, 0, canvas.width, canvas.height );

				// "data:image/png;base64,...."
				const data = canvas.toDataURL( "image/png" );
				this.images.push( { media: "image/png", data: data.slice( data.indexOf( "," ) + 1 ) } );
			}
			catch {
				// what is not a picture is left out
			}
			finally {
				URL.revokeObjectURL( url );
			}
		}

		this.showWaiting( );
		this.prompt.focus( );
	}

	/** the pictures that wait: a click on one takes it away */
	private showWaiting( ): void {
		this.waiting.setContent( this.images.map( image => new Component( {
			tag: "img",
			cls: "thumb",
			attrs: { src: `data:${image.media};base64,${image.data}`, title: "Click to take it away" },
			dom_events: {
				click: ( ) => {
					this.images = this.images.filter( other => other !== image );
					this.showWaiting( );
				},
			},
		} ) ) );

		this.waiting.show( this.images.length > 0 );
	}

	private addLine( entry: ChatEntry, scroll: boolean ): void {
		// what he typed, and the pictures he sent with it
		const pictures = ( entry.images ?? [] ).map( src => new Component( { tag: "img", cls: "thumb", attrs: { src } } ) );
		const line = new Component( { cls: `line ${entry.kind}`, content: pictures.length ? [...pictures, new Component( { tag: "span", content: entry.text } )] : entry.text } );

		this.lines.set( entry, line );
		this.log.appendContent( line );

		if( scroll ) {
			this.toEnd( );
		}
	}

	private growLine( entry: ChatEntry ): void {
		const line = this.lines.get( entry );

		if( line ) {
			line.setContent( entry.text );
			this.toEnd( );
		}
	}

	private toEnd( ): void {
		this.log.dom.scrollTop = this.log.dom.scrollHeight;
	}

	/**
	 * While the assistant works, the button stops it. Without a key,
	 * nothing can be sent: it is asked for.
	 */

	private setBusy( on: boolean ): void {
		this.go.setText( on ? "Stop" : "Send" );
		this.go.enable( on || !!this.key );
		this.fresh.enable( !on );
		this.setup.show( !this.key );
		this.setClass( "busy", on );
	}
}
