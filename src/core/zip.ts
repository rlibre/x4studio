/**
 * @file zip.ts
 * @description reading and writing a zip archive
 *
 * In its web mode, the studio opens a project as a zip and gives it back
 * as one. Only the container is done here: the headers, the directory at
 * the end and the checksums. What is inside an entry is compressed and
 * expanded by the browser (CompressionStream, "deflate-raw"), which node
 * has too.
 *
 * An entry is kept as it is in the archive, compressed: one that is not
 * touched is written back byte for byte, whatever it holds.
 *
 * Not done: archives of more than 4 GB or 65535 entries (zip64), archives
 * in several parts, encrypted entries.
 *
 * (no DOM here: this file runs as is under node, for the tests)
 */

/** the two ways an entry is kept that are known here */
const STORED = 0;
const DEFLATED = 8;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;

const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;

/** flags of an entry: it is encrypted; its sizes come after its data; its name is UTF-8 */
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DESCRIPTOR = 0x0008;
const FLAG_UTF8 = 0x0800;

/** what a size or an offset holds when the real one is elsewhere (zip64) */
const TOO_BIG = 0xffffffff;

export interface ZipEntry {
	/** from the root of the archive, with "/" between the folders; a folder ends with "/" */
	path: string;

	method: number;			// how `raw` is kept: 0 as it is, 8 deflated
	flags: number;
	time: number;			// when it was changed, as DOS writes it
	date: number;
	crc: number;			// checksum of the data, expanded
	size: number;			// of the data, expanded
	attrs: number;			// what the system that made the archive said of the file

	/** the data, as it is in the archive */
	raw: Uint8Array;
}

// :: CHECKSUM ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

const CRC_TABLE = new Uint32Array( 256 );

for( let n = 0; n < 256; n++ ) {
	let c = n;
	for( let k = 0; k < 8; k++ ) {
		c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
	}

	CRC_TABLE[n] = c >>> 0;
}

/**
 * the CRC-32 of some bytes, as a zip wants it
 */

export function crc32( data: Uint8Array ): number {
	let crc = 0xffffffff;

	for( let i = 0; i < data.length; i++ ) {
		crc = CRC_TABLE[( crc ^ data[i] ) & 0xff] ^ ( crc >>> 8 );
	}

	return ( crc ^ 0xffffffff ) >>> 0;
}

// :: COMPRESSION :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/**
 * some bytes through a stream of the browser, which compresses or expands
 */

async function through( data: Uint8Array, stream: CompressionStream | DecompressionStream ): Promise<Uint8Array> {
	const source = new Blob( [data as BlobPart] ).stream( );
	const result = new Response( source.pipeThrough( stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array> ) );

	return new Uint8Array( await result.arrayBuffer( ) );
}

/** when a file was changed, as DOS writes it: two seconds are the smallest step, 1980 the first year */
function dosTime( when: Date ): { time: number, date: number } {
	return {
		time: ( when.getHours( ) << 11 ) | ( when.getMinutes( ) << 5 ) | ( when.getSeconds( ) >> 1 ),
		date: ( Math.max( 0, when.getFullYear( ) - 1980 ) << 9 ) | ( ( when.getMonth( ) + 1 ) << 5 ) | when.getDate( ),
	};
}

/**
 * An entry for some data. It is deflated, unless that makes it bigger
 * (something small, or already compressed).
 */

export async function makeEntry( path: string, data: Uint8Array, when = new Date( ) ): Promise<ZipEntry> {
	const deflated = data.length ? await through( data, new CompressionStream( "deflate-raw" ) ) : data;
	const smaller = deflated.length < data.length;

	return {
		path,
		method: smaller ? DEFLATED : STORED,
		flags: FLAG_UTF8,
		...dosTime( when ),
		crc: crc32( data ),
		size: data.length,
		attrs: 0,
		raw: smaller ? deflated : data,
	};
}

/**
 * The data of an entry, expanded. Throws for an entry that is encrypted,
 * or kept in a way that is not known here.
 */

export async function entryData( entry: ZipEntry ): Promise<Uint8Array> {
	if( entry.flags & FLAG_ENCRYPTED ) {
		throw new Error( `zip: "${entry.path}" is encrypted` );
	}

	switch( entry.method ) {
		case STORED:	return entry.raw;
		case DEFLATED:	return through( entry.raw, new DecompressionStream( "deflate-raw" ) );
	}

	throw new Error( `zip: "${entry.path}" is compressed in a way that is not known (${entry.method})` );
}

// :: READING :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/**
 * The entries of an archive, in the order of its directory. Nothing is
 * expanded: see entryData. Throws when the bytes are not a zip, or are
 * one that is not read here (see the top of the file).
 */

export function readZip( bytes: Uint8Array ): ZipEntry[] {
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	const decoder = new TextDecoder( );

	// The record at the end says where the directory is. A comment may
	// follow it: it is looked for from the end, backwards.
	let end = bytes.length - END_SIZE;
	while( end >= 0 && view.getUint32( end, true ) !== END_RECORD ) {
		end--;
	}

	if( end < 0 ) {
		throw new Error( "zip: not a zip archive" );
	}

	const count = view.getUint16( end + 10, true );
	let at = view.getUint32( end + 16, true );

	if( view.getUint16( end + 4, true ) !== 0 || count === 0xffff || at === TOO_BIG ) {
		throw new Error( "zip: archives in several parts, or too big (zip64), are not read" );
	}

	const entries: ZipEntry[] = [];

	for( let i = 0; i < count; i++ ) {
		if( at + CENTRAL_SIZE > bytes.length || view.getUint32( at, true ) !== CENTRAL_HEADER ) {
			throw new Error( "zip: the directory of the archive is damaged" );
		}

		const packed = view.getUint32( at + 20, true );
		const size = view.getUint32( at + 24, true );
		const nameLength = view.getUint16( at + 28, true );
		const extraLength = view.getUint16( at + 30, true );
		const commentLength = view.getUint16( at + 32, true );
		const local = view.getUint32( at + 42, true );

		if( packed === TOO_BIG || size === TOO_BIG || local === TOO_BIG ) {
			throw new Error( "zip: archives too big (zip64) are not read" );
		}

		// The data follows the header the entry has before it, whose name
		// and extra fields may not be as long as those of the directory.
		if( local + LOCAL_SIZE > bytes.length || view.getUint32( local, true ) !== LOCAL_HEADER ) {
			throw new Error( "zip: an entry of the archive is damaged" );
		}

		const start = local + LOCAL_SIZE + view.getUint16( local + 26, true ) + view.getUint16( local + 28, true );
		if( start + packed > bytes.length ) {
			throw new Error( "zip: an entry of the archive is cut" );
		}

		entries.push( {
			// some tools of Windows wrote "\" between the folders
			path: decoder.decode( bytes.subarray( at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength ) ).replaceAll( "\\", "/" ),
			method: view.getUint16( at + 10, true ),

			// the sizes are written in the headers here, never after the data
			flags: view.getUint16( at + 8, true ) & ~FLAG_DESCRIPTOR,
			time: view.getUint16( at + 12, true ),
			date: view.getUint16( at + 14, true ),
			crc: view.getUint32( at + 16, true ),
			size,
			attrs: view.getUint32( at + 38, true ),
			raw: bytes.slice( start, start + packed ),
		} );

		at += CENTRAL_SIZE + nameLength + extraLength + commentLength;
	}

	return entries;
}

// :: WRITING :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

/**
 * An archive that holds the entries, in their order: each one with its
 * header before it, then the directory, then the record of the end.
 */

export function writeZip( entries: ZipEntry[] ): Uint8Array {
	const encoder = new TextEncoder( );
	const names = entries.map( entry => encoder.encode( entry.path ) );

	const dataSize = entries.reduce( ( sum, entry, i ) => sum + LOCAL_SIZE + names[i].length + entry.raw.length, 0 );
	const directorySize = names.reduce( ( sum, name ) => sum + CENTRAL_SIZE + name.length, 0 );

	if( entries.length >= 0xffff || dataSize + directorySize >= TOO_BIG ) {
		throw new Error( "zip: too many entries, or too big, for an archive that is not zip64" );
	}

	const bytes = new Uint8Array( dataSize + directorySize + END_SIZE );
	const view = new DataView( bytes.buffer );
	const offsets: number[] = [];

	let at = 0;

	entries.forEach( ( entry, i ) => {
		const name = names[i];
		offsets.push( at );

		view.setUint32( at, LOCAL_HEADER, true );
		view.setUint16( at + 4, 20, true );				// the version needed to read it: 2.0, folders and deflate
		view.setUint16( at + 6, entry.flags, true );
		view.setUint16( at + 8, entry.method, true );
		view.setUint16( at + 10, entry.time, true );
		view.setUint16( at + 12, entry.date, true );
		view.setUint32( at + 14, entry.crc, true );
		view.setUint32( at + 18, entry.raw.length, true );
		view.setUint32( at + 22, entry.size, true );
		view.setUint16( at + 26, name.length, true );
		view.setUint16( at + 28, 0, true );				// no extra field

		bytes.set( name, at + LOCAL_SIZE );
		bytes.set( entry.raw, at + LOCAL_SIZE + name.length );

		at += LOCAL_SIZE + name.length + entry.raw.length;
	} );

	const directory = at;

	entries.forEach( ( entry, i ) => {
		const name = names[i];

		view.setUint32( at, CENTRAL_HEADER, true );
		view.setUint16( at + 4, 20, true );				// the version that made it
		view.setUint16( at + 6, 20, true );				// the version needed to read it
		view.setUint16( at + 8, entry.flags, true );
		view.setUint16( at + 10, entry.method, true );
		view.setUint16( at + 12, entry.time, true );
		view.setUint16( at + 14, entry.date, true );
		view.setUint32( at + 16, entry.crc, true );
		view.setUint32( at + 20, entry.raw.length, true );
		view.setUint32( at + 24, entry.size, true );
		view.setUint16( at + 28, name.length, true );
		view.setUint16( at + 30, 0, true );				// no extra field
		view.setUint16( at + 32, 0, true );				// no comment
		view.setUint16( at + 34, 0, true );				// in the first part of the archive
		view.setUint16( at + 36, 0, true );				// nothing said of what the data is
		view.setUint32( at + 38, entry.attrs, true );
		view.setUint32( at + 42, offsets[i], true );

		bytes.set( name, at + CENTRAL_SIZE );
		at += CENTRAL_SIZE + name.length;
	} );

	view.setUint32( at, END_RECORD, true );
	view.setUint16( at + 4, 0, true );					// one part only
	view.setUint16( at + 6, 0, true );
	view.setUint16( at + 8, entries.length, true );
	view.setUint16( at + 10, entries.length, true );
	view.setUint32( at + 12, at - directory, true );
	view.setUint32( at + 16, directory, true );
	view.setUint16( at + 20, 0, true );					// no comment

	return bytes;
}
