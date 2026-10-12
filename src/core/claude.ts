/**
 * @file claude.ts
 * @description a question to Claude, over the API of Anthropic
 *
 * One request: the conversation so far goes, the answer comes back as it
 * is written (server-sent events). Done by hand with `fetch`: the studio
 * has no dependency for it.
 *
 * As the documentation of the API gives it (platform.claude.com/docs,
 * "Streaming messages", read on 2026-10-12):
 *
 *   message_start
 *   content_block_start    a block of the answer begins: a text, the use of a tool
 *   content_block_delta    a piece of it: text_delta, input_json_delta (the
 *                          input of a tool, as pieces of a JSON text)...
 *   content_block_stop
 *   message_delta          why the answer ends (stop_reason)
 *   message_stop
 *
 * and `ping`, `error`, and others to come, which are to be ignored.
 *
 * The API is called from the page itself: it answers a browser only when
 * the request says it knows what it does (the header
 * "anthropic-dangerous-direct-browser-access"; checked on 2026-10-12, the
 * answer has "access-control-allow-origin" with it, and not without). The
 * key is then in the browser of the user: his own key, on his own machine.
 *
 * (no x4 here: this file runs as is under node, for the tests)
 */

const API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** the longest answer that is asked for, in tokens */
const MAX_TOKENS = 16000;

/** a block of a message: a text, the use of a tool, its result... */
export interface ChatBlock {
	type: string;
	[name: string]: unknown;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string | ChatBlock[];
}

/** a tool the model may use: what it is for, and the JSON schema of what it takes */
export interface ChatTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export interface ChatRequest {
	key: string;
	model: string;
	system: string;
	messages: ChatMessage[];
	tools?: ChatTool[];

	/** to give up: the request is aborted */
	signal?: AbortSignal;

	/** called with each piece of text of the answer, as it comes */
	text?: ( piece: string ) => void;
}

export interface ChatAnswer {
	/** the blocks of the answer, as they are to be given back in the conversation */
	content: ChatBlock[];

	/** why it ended: "end_turn", "tool_use" (it waits for the results of tools), "max_tokens"... */
	stop: string;
}

/**
 * Makes the answer from the text of the stream, which comes in pieces cut
 * anywhere. Each event is a line "data: " followed by a JSON that says its
 * own type; the other lines are not needed.
 */

export class AnswerReader {

	readonly content: ChatBlock[] = [];
	stop: string = null;

	private text: ( piece: string ) => void;
	private rest = "";								// the line that is not whole yet
	private inputs = new Map<number, string>( );	// the input of the tools that are being written, by the index of their block

	constructor( text?: ( piece: string ) => void ) {
		this.text = text;
	}

	/**
	 * A piece of the stream. Throws when the stream says an error happened.
	 */

	push( piece: string ): void {
		const lines = ( this.rest + piece ).split( "\n" );
		this.rest = lines.pop( );

		for( const line of lines ) {
			if( line.startsWith( "data:" ) ) {
				this.event( JSON.parse( line.slice( 5 ) ) );
			}
		}
	}

	private event( data: any ): void {
		switch( data.type ) {
			case "content_block_start": {
				this.content[data.index] = { ...data.content_block };

				if( data.content_block.type === "tool_use" ) {
					this.inputs.set( data.index, "" );
				}
				break;
			}

			case "content_block_delta": {
				const block = this.content[data.index];
				const delta = data.delta;

				if( !block || !delta ) {
					break;
				}

				if( delta.type === "text_delta" ) {
					block.text = `${block.text ?? ""}${delta.text}`;
					if( this.text ) {
						this.text( delta.text );
					}
				}
				else if( delta.type === "input_json_delta" ) {
					this.inputs.set( data.index, ( this.inputs.get( data.index ) ?? "" ) + delta.partial_json );
				}
				// what the model thought: given back as it came, with its signature
				else if( delta.type === "thinking_delta" ) {
					block.thinking = `${block.thinking ?? ""}${delta.thinking}`;
				}
				else if( delta.type === "signature_delta" ) {
					block.signature = delta.signature;
				}
				break;
			}

			// the input of a tool is whole: it is an object
			case "content_block_stop": {
				const input = this.inputs.get( data.index );

				if( input !== undefined ) {
					this.content[data.index].input = input.trim( ) ? JSON.parse( input ) : {};
					this.inputs.delete( data.index );
				}
				break;
			}

			case "message_delta": {
				if( data.delta && data.delta.stop_reason ) {
					this.stop = data.delta.stop_reason;
				}
				break;
			}

			case "error": {
				throw new Error( errorText( data ) );
			}
		}
	}
}

/**
 * What an error of the API says: { "type": "error", "error": { "type", "message" } }
 */

function errorText( data: any ): string {
	const error = data && data.error;
	return error && typeof error.message === "string" ? error.message : "The API answered with an error.";
}

/**
 * Ask: the answer is returned when it is whole. Throws when the API
 * refuses (a key that is not one, a model it does not know...), with what
 * it says, and when the request is aborted.
 */

export async function ask( request: ChatRequest ): Promise<ChatAnswer> {
	const body: Record<string, unknown> = {
		model: request.model,
		max_tokens: MAX_TOKENS,

		// what does not change from a request to the next is not read again in full
		cache_control: { type: "ephemeral" },

		system: request.system,
		messages: request.messages,
		stream: true,
	};

	if( request.tools && request.tools.length ) {
		body.tools = request.tools;
	}

	const response = await fetch( API, {
		method: "POST",
		signal: request.signal,
		headers: {
			"content-type": "application/json",
			"x-api-key": request.key,
			"anthropic-version": API_VERSION,
			"anthropic-dangerous-direct-browser-access": "true",
		},
		body: JSON.stringify( body ),
	} );

	if( !response.ok ) {
		let message = `The API answered ${response.status}.`;

		try {
			message = errorText( await response.json( ) );
		}
		catch {
			// not the JSON of an error: the status says what there is to say
		}

		throw new Error( message );
	}

	const reader = new AnswerReader( request.text );
	const decoder = new TextDecoder( );
	const stream = response.body.getReader( );

	for( ;; ) {
		const { done, value } = await stream.read( );
		if( done ) {
			break;
		}

		reader.push( decoder.decode( value, { stream: true } ) );
	}

	// a last line without its end
	reader.push( "\n" );

	return { content: reader.content, stop: reader.stop };
}
