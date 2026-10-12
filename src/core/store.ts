/**
 * @file store.ts
 * @description where the files of a project are kept
 *
 * The studio does not know where a project is: a folder of the disk (the
 * desktop application), a zip the user opens and gets back (the web page),
 * a server. It only asks for what is below, and everything is asked the
 * same way: asynchronously, a file by its path from the root of the
 * project, with "/" between the folders.
 *
 * (no DOM here: this file runs as is under node, for the tests)
 */

import { entryData, makeEntry, readZip, writeZip } from "./zip.ts";
import type { ZipEntry } from "./zip.ts";

export interface ProjectStore {
	/** how the project is called where it is kept: the name of its folder, of its zip */
	readonly name: string;

	/** the files of a folder and of those inside it, sorted; "" is the whole project */
	list( folder: string ): Promise<string[]>;

	/** the text of a file; null when there is no such file */
	read( path: string ): Promise<string>;

	write( path: string, text: string ): Promise<void>;
	remove( path: string ): Promise<void>;

	/**
	 * Make what was written last: a zip is given back to the user. Where
	 * a file is written as soon as it is asked, there is nothing to do.
	 */
	commit( ): Promise<void>;
}

/** what a ZipStore does with its archive when it is committed: the web page downloads it */
export type ZipDelivery = ( name: string, bytes: Uint8Array ) => void | Promise<void>;

/**
 * A project kept as a zip, in memory.
 *
 * The archive may hold more than the studio knows: the whole folder of an
 * application, for example. What is not touched comes back as it was.
 *
 * It may also have been made from the folder itself, and not from what is
 * in it: everything is then under one folder. The root of the project is
 * where its `marker` is (the file that says it is a project), wherever
 * that is in the archive.
 */

export class ZipStore implements ProjectStore {

	name: string;

	private entries = new Map<string, ZipEntry>( );		// by their path in the archive
	private base = "";									// the root of the project, in the archive
	private deliver: ZipDelivery;

	/**
	 * @param bytes the archive; none for a new project
	 * @param marker the path, from the root of the project, of the file that tells where that root is
	 */

	constructor( name: string, deliver: ZipDelivery, bytes?: Uint8Array, marker?: string ) {
		this.name = name;
		this.deliver = deliver;

		if( bytes ) {
			for( const entry of readZip( bytes ) ) {
				this.entries.set( entry.path, entry );
			}

			// the nearest of the root, if there are several
			const found = marker ? [...this.entries.keys( )].filter( path => path === marker || path.endsWith( `/${marker}` ) ) : [];
			found.sort( ( a, b ) => a.length - b.length );

			if( found.length ) {
				this.base = found[0].slice( 0, found[0].length - marker.length );
			}
		}
	}

	/**
	 * A path as it is in the archive: no "/" in front, none doubled, and
	 * under the root of the project.
	 */

	private key( path: string ): string {
		return this.base + path.split( "/" ).filter( part => part !== "" ).join( "/" );
	}

	async list( folder: string ): Promise<string[]> {
		const key = this.key( folder );
		const inside = key === this.base ? key : `${key}/`;

		// a path that ends with "/" is a folder of the archive, not a file
		return [...this.entries.keys( )]
			.filter( path => path.startsWith( inside ) && !path.endsWith( "/" ) )
			.map( path => path.slice( this.base.length ) )
			.sort( );
	}

	async read( path: string ): Promise<string> {
		const entry = this.entries.get( this.key( path ) );
		return entry ? new TextDecoder( ).decode( await entryData( entry ) ) : null;
	}

	async write( path: string, text: string ): Promise<void> {
		const key = this.key( path );
		this.entries.set( key, await makeEntry( key, new TextEncoder( ).encode( text ) ) );
	}

	async remove( path: string ): Promise<void> {
		this.entries.delete( this.key( path ) );
	}

	/**
	 * the archive, as it is now
	 */

	toBytes( ): Uint8Array {
		return writeZip( [...this.entries.values( )] );
	}

	async commit( ): Promise<void> {
		await this.deliver( this.name, this.toBytes( ) );
	}
}
