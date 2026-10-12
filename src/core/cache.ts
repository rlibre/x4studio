/**
 * @file cache.ts
 * @description the project the studio works on, kept in the browser
 *
 * The web page has no folder to write in: a project is a zip in memory,
 * and what is in memory is lost when the page is loaded again. So the zip
 * is kept by the browser each time the project is saved, and taken back
 * when the studio starts.
 *
 * One project, no more (Etienne, 2026-10-12: "cache = 1, cleaned at each
 * upload"): the one that was saved, or opened, last. It is a cache, not a
 * backup: a browser may empty it by itself (MDN, "Storage quotas and
 * eviction criteria", read on 2026-10-12: when the disk is short, and in
 * Safari after seven days without a visit). The zip that is exported is
 * what is to be kept.
 *
 * In IndexedDB, not in localStorage: that one keeps texts, 5 MiB of them
 * for a site (same page of MDN), and a zip is bytes.
 *
 * (the browser only: nothing here runs under node)
 */

const DATABASE = "x4studio";
const STORE = "cache";
const KEY = "project";

export interface CachedProject {
	/** the name of its zip */
	name: string;
	bytes: Uint8Array;

	/** when it was kept: milliseconds, as Date.now gives them */
	savedAt: number;
}

function database( ): Promise<IDBDatabase> {
	return new Promise( ( resolve, reject ) => {
		const request = indexedDB.open( DATABASE, 1 );

		request.onupgradeneeded = ( ) => { request.result.createObjectStore( STORE ); };
		request.onsuccess = ( ) => resolve( request.result );
		request.onerror = ( ) => reject( request.error );
	} );
}

/** one request to the store, and its result */
async function run<T>( mode: IDBTransactionMode, action: ( store: IDBObjectStore ) => IDBRequest<T> ): Promise<T> {
	const db = await database( );

	try {
		return await new Promise<T>( ( resolve, reject ) => {
			const transaction = db.transaction( STORE, mode );
			const request = action( transaction.objectStore( STORE ) );

			// what was written is there when the transaction is over, not before
			transaction.oncomplete = ( ) => resolve( request.result );
			transaction.onerror = ( ) => reject( transaction.error );
			transaction.onabort = ( ) => reject( transaction.error );
		} );
	}
	finally {
		db.close( );
	}
}

/**
 * The project that was kept; null when there is none, and when the
 * browser keeps nothing (a private window, a storage that is refused).
 */

export async function cachedProject( ): Promise<CachedProject> {
	try {
		const kept = await run<CachedProject>( "readonly", store => store.get( KEY ) );
		return kept && kept.bytes instanceof Uint8Array && typeof kept.name === "string" ? kept : null;
	}
	catch {
		return null;
	}
}

/**
 * Keep a project: it takes the place of the one that was there. Throws
 * when the browser does not keep it.
 */

export async function cacheProject( name: string, bytes: Uint8Array ): Promise<void> {
	const kept: CachedProject = { name, bytes, savedAt: Date.now( ) };
	await run( "readwrite", store => store.put( kept, KEY ) );
}
