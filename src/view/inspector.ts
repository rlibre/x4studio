/**
 * @file inspector.ts
 * @description the inspector: what is selected on the page, in sections that fold
 *
 * One panel for everything that can be said of what is selected:
 *
 *   Attributes   the properties of the component, as its description gives them
 *   Classes      the styles of the project it has: tags, and a field that
 *                completes what is typed to add one, or to make a new one
 *   ...          the CSS properties the studio knows, by family (they are
 *                data: the "look" of src/components.json)
 *   Custom       names and values, for what has no field: the variables of
 *                the x4 components above all
 *
 * What is changed here is changed for what is selected, and for it alone,
 * whatever classes it has: a class gives values, the component sets its own
 * over them. A field that holds no value shows, dimmed, the one that
 * applies.
 *
 * To change a class, its style is edited: a click on its tag. The
 * inspector then shows the class instead of the selection, with the same
 * sections, until the user goes back.
 */

import { AutoComplete, Button, Component, ComponentProps, HBox, Icon, Input, Label, Menu, MessageBox, Tag, asap } from "x4js";

// the arrow of what folds: the one of the tree of the objects
import icons from "../icons.ts";

import type { DNode } from "../core/document.ts";
import { commonProperties, getObjectType, getProp } from "../core/registry.ts";
import type { PropertyDef } from "../core/registry.ts";

import { propertyKind } from "../core/components.ts";
import { CSS_PROP, STYLES_PROP, VARS_PROP, getLook, getStyles, isStyleName, localCss, localVars, nextStyleId, pairsOf, pairsText, styleIds } from "../core/styles.ts";
import type { StyleDef, StyleProperty } from "../core/styles.ts";

import type { CurrentSurface } from "./current.ts";
import { makeField } from "./fields.ts";
import type { Field } from "./fields.ts";

import "./inspector.scss";

/** a field is changed as the user types: a pause this long, in ms, ends the undo step */
const EDIT_PAUSE = 600;

/** the section that is open the first time the inspector is seen */
const FIRST_OPEN = "Attributes";

/** the properties every component has, whose fields go two on a row */
const HALF = ["width", "height", "w", "h"];

interface InspectorProps extends ComponentProps {
	surface: CurrentSurface;

	/**
	 * The styles of the project were changed here. `classes` is true when
	 * the classes themselves were (one was renamed or removed): the
	 * components that have them are to be built again.
	 */
	stylesChange: ( styles: StyleDef[], classes: boolean ) => void;

	/** rename a class, or delete it: asked from the header of its style, done by the host */
	renameClass: ( style: StyleDef ) => void;
	removeClass: ( style: StyleDef ) => void;

	/** the inspector shows the style of another class, or goes back to what is selected (see getEditing) */
	editingChange: ( ) => void;
}

/** a field, and where its value is read */
interface Shown {
	field: Field;
	read: ( ) => { value: unknown, applies?: string };
}

/**
 *
 */

export class Inspector extends Component<InspectorProps> {

	private editing: number = null;			// the id of the class whose style is shown; null: what is selected
	private built: string = null;			// what the sections were built from
	private shown: Shown[] = [];
	private state: { open: string[] };		// the titles of the sections that are open, remembered from a session to the next
	private adding = false;					// an empty row is shown in "Custom", to be filled in
	private pause: ReturnType<typeof setTimeout> = null;
	private completer: AutoComplete = null;	// the field of "Classes"
	private refocus = false;				// a class was just added: the field takes the focus again

	constructor( props: InspectorProps ) {
		super( props );

		// At first, only the attributes are open: the sections are many, and
		// the others are opened when they are needed. (What is kept is what
		// is open, not what is folded: a section that is new is folded.)
		this.state = this.loadPState( "x4studio.inspector", { open: [FIRST_OPEN] } );
		if( !Array.isArray( this.state.open ) ) {
			this.state.open = [FIRST_OPEN];
		}

		props.surface.on( "selectionChange", ( ) => this.update( ) );
		props.surface.on( "change", ( ) => this.update( ) );

		this.update( );
	}

	// :: WHAT IS SHOWN :::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/** the class whose style is edited; undefined when it is the selection that is shown */
	private style( ): StyleDef {
		return this.editing === null ? undefined : getStyles( ).find( style => style.id === this.editing );
	}

	/**
	 * Bring the inspector up to date. The sections only depend on what is
	 * shown, not on its values: they are built again when that changes,
	 * and the fields are only filled otherwise, so that the one the user is
	 * in is left alone.
	 *
	 * Also to call after the styles of the project, or the descriptions of
	 * the components, changed (`force`).
	 */

	update( force = false ): void {
		const surface = this.props.surface;

		// the class that was edited is not there anymore
		if( this.editing !== null && !this.style( ) ) {
			this.editing = null;
		}

		const style = this.style( );
		const subjects = surface.getSubjects( );
		const styles = getStyles( );

		const key = style
			? JSON.stringify( ["class", style.id, style.name, pairsOf( style.css ).map( pair => pair[0] ), this.adding] )
			: JSON.stringify( [
				"nodes",
				subjects.map( node => [node.type, node.name ?? "", styleIds( node )] ),
				styles.map( s => [s.id, s.name] ),
				subjects.length ? Object.keys( localVars( subjects[0] ) ) : [],
				this.adding,
			] );

		// noted as built once it is: a section that fails is tried again, not left as it was
		if( force || key !== this.built ) {
			this.built = null;
			this.build( style, subjects );
			this.built = key;
		}

		for( const { field, read } of this.shown ) {
			const { value, applies } = read( );
			field.set( value, applies );
		}
	}

	private build( style: StyleDef, subjects: DNode[] ): void {
		this.shown = [];
		this.completer = null;

		if( style ) {
			this.setContent( [
				this.classHeader( style ),
				...this.cssSections(
					property => ( { value: style.values[property.name] } ),
					( property, value ) => this.writeStyleValue( style, property, value ),
				),
				this.customSection( pairsOf( style.css ), pairs => this.setStyleCss( style, pairs ) ),
			] );
		}
		else if( subjects.length ) {
			this.setContent( [
				this.selectionHeader( subjects ),
				this.attributesSection( subjects ),
				this.classesSection( subjects ),
				...this.cssSections(
					property => ( { value: this.common( node => localCss( node )[property.name] ), applies: this.props.surface.applied( property.css ) } ),
					( property, value ) => this.write( ( ) => this.props.surface.patch( CSS_PROP, property.name, value ) ),
				),
				this.customSection(
					Object.entries( localVars( subjects[0] ) ).map( ( [name, value] ) => [name, String( value ?? "" )] ),
					pairs => this.setVars( pairs ),
				),
			] );
		}
		else {
			this.setContent( new Label( { cls: "what", text: "No page is open" } ) );
		}

		if( this.refocus ) {
			this.refocus = false;
			this.completer?.getInput( ).focus( );
		}
	}

	/**
	 * What is selected, at the top of the inspector: the kind of component
	 * it is, with its icon, as its description names it; then the name the
	 * user gave it, when it has one. For several components: how many, and
	 * their kind, or their kinds.
	 */

	private selectionHeader( subjects: DNode[] ): Component {
		const types = [...new Set( subjects.map( node => node.type ) )];
		const titles = types.map( type => {
			const def = getObjectType( type );
			return def ? def.title : type;
		} );

		// one kind: its icon, and what it is as a tooltip
		let icon: string = null;
		let description: string = null;

		if( types.length === 1 ) {
			const def = getObjectType( types[0] );

			if( def ) {
				icon = def.icon;
				description = def.description;
			}
		}

		let kind = titles[0];

		if( types.length > 1 ) {
			kind = `${subjects.length} components: ${titles.join( ", " )}`;
		}
		else if( subjects.length > 1 ) {
			kind = `${subjects.length} × ${titles[0]}`;
		}

		const name = subjects.length === 1 ? subjects[0].name : null;

		return new HBox( {
			cls: "what",
			tooltip: description,
			content: [
				icon ? new Icon( { cls: "kind", iconId: icon } ) : null,
				new Label( { cls: "type", text: kind } ),
				name ? new Label( { cls: "name", flex: true, text: name } ) : null,
			],
		} );
	}

	/**
	 * the value everything that is selected has; undefined when they do not agree
	 */

	private common( read: ( node: DNode ) => unknown ): unknown {
		const values = this.props.surface.getSubjects( ).map( read );

		// a value may be an object (the four sides of a padding): what it holds is compared
		const same = ( a: unknown, b: unknown ) => a === b || ( typeof a === "object" && typeof b === "object" && JSON.stringify( a ) === JSON.stringify( b ) );

		return values.length && values.every( value => same( value, values[0] ) ) ? values[0] ?? undefined : undefined;
	}

	/**
	 * Change the page as the user types: the changes made in a row are one
	 * step for undo, which ends after a pause.
	 */

	private write( change: ( ) => void ): void {
		const surface = this.props.surface;

		surface.beginEdit( );
		change( );

		clearTimeout( this.pause );
		this.pause = setTimeout( ( ) => {
			this.pause = null;
			surface.endEdit( );
		}, EDIT_PAUSE );
	}

	// :: SECTIONS ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * A section: a title that folds it, what it holds, and maybe a button
	 * beside the title. The button is not inside what folds: a click on it
	 * is not a click on the title.
	 */

	private section( title: string, body: Component[], gadget?: Component ): Component {
		const isFolded = ( ) => !this.state.open.includes( title );

		// folded or not, from a session to the next
		const toggle = ( ) => {
			this.state.open = isFolded( ) ? [...this.state.open, title] : this.state.open.filter( t => t !== title );
			section.setClass( "folded", isFolded( ) );
		};

		// The title and the arrow fold the section. They are two elements
		// side by side, each with its click: the button between them is
		// not inside something that is clicked.
		const section: Component = new Component( {
			cls: isFolded( ) ? "section folded" : "section",
			content: [
				new HBox( {
					cls: "head",
					content: [
						new Label( { cls: "title", flex: true, text: title, dom_events: { click: toggle } } ),
						gadget,
						new Icon( { cls: "fold", iconId: icons.chevron, tooltip: "Fold, or unfold", dom_events: { click: toggle } } ),
					],
				} ),
				new Component( { cls: "body", content: body } ),
			],
		} );

		return section;
	}

	/**
	 * a field of a section: it is filled each time the inspector is brought up to date
	 */

	private field( def: Field["def"], read: Shown["read"], change: ( value: unknown ) => void ): Component {
		const field = makeField( def, change );
		this.shown.push( { field, read } );
		return field.row;
	}

	/**
	 * The properties of the components that are selected: those they
	 * share, as their descriptions give them, then their size.
	 */

	private attributesSection( subjects: DNode[] ): Component {
		const types = [...new Set( subjects.map( node => node.type ) )];
		const properties = commonProperties( types );

		// What the registry calls a text may be the name of an icon
		// of the project: the descriptions of the components say so.
		const kindOf = ( property: PropertyDef ) => types.every( type => propertyKind( type, property.name ) === "icon" ) ? "icon" : property.type;

		return this.section( "Attributes", properties.map( property => this.field(
			{ name: property.name, title: property.title, type: kindOf( property ), min: property.min, max: property.max, step: property.step, options: property.options, half: HALF.includes( property.name ) },
			( ) => ( { value: this.common( node => getProp( node, property.name ) ) } ),
			value => this.writeAttribute( property, value ),
		) ) );
	}

	/**
	 * A property of a component has a value, unless it may have none: an
	 * emptied text is an empty text, an emptied number is no value when the
	 * property allows it, and a choice cannot be taken away.
	 */

	private writeAttribute( property: PropertyDef, typed: unknown ): void {
		let value = typed;

		if( value === undefined ) {
			if( property.type === "string" ) {
				value = "";
			}
			else if( property.type === "number" && property.optional ) {
				value = null;
			}
			else {
				return;
			}
		}

		const surface = this.props.surface;
		this.write( ( ) => surface.setProps( { [property.name]: value }, surface.getSubjects( ) ) );
	}

	/**
	 * The CSS properties the studio knows, a section for each of their
	 * groups, in the order they are described.
	 */

	private cssSections( read: ( property: StyleProperty ) => { value: unknown, applies?: string }, change: ( property: StyleProperty, value: unknown ) => void ): Component[] {
		const groups: { title: string, rows: Component[] }[] = [];

		for( const property of getLook( ) ) {
			const title = property.group ?? "Style";
			let group = groups.find( g => g.title === title );

			if( !group ) {
				group = { title, rows: [] };
				groups.push( group );
			}

			group.rows.push( this.field( property, ( ) => read( property ), value => change( property, value ) ) );
		}

		return groups.map( group => this.section( group.title, group.rows ) );
	}

	/**
	 * Names and values, for what has no field: a row for each, and a
	 * button that adds an empty one. A row counts once its name and its
	 * value are given; emptied, it goes.
	 */

	private customSection( pairs: [string, string][], change: ( pairs: [string, string][] ) => void ): Component {
		const rows: { name: Input, value: Input }[] = [];

		const commit = ( ) => {
			this.adding = false;
			change( rows.map( row => [row.name.getValue( ).trim( ), row.value.getValue( ).trim( )] ) );
			this.update( );
		};

		const makeRow = ( name: string, value: string ): Component => {
			const row = {
				name: new Input( { type: "text", cls: "name", value: name, placeholder: "--variable, or property", dom_events: { change: commit } } ),
				value: new Input( { type: "text", cls: "value", value, placeholder: "value", dom_events: { change: commit } } ),
			};

			rows.push( row );
			return new HBox( { cls: "pair", content: [row.name, row.value] } );
		};

		const body = pairs.map( ( [name, value] ) => makeRow( name, value ) );

		if( this.adding ) {
			body.push( makeRow( "", "" ) );
		}

		const add = new Button( {
			cls: "outline gadget",
			label: "+",
			tooltip: "A name and a value: a CSS property that has no field, or a variable of a component",
			click: ( ) => {
				this.adding = true;
				this.update( );
			},
		} );

		return this.section( "Custom", body, add );
	}

	// :: THE CLASSES OF WHAT IS SELECTED :::::::::::::::::::::::::::::::::::::

	/**
	 * The classes of the first component that is selected, as tags, and a
	 * field to add one: it offers the styles of the project as the user
	 * types, and a name that no style has makes a new one.
	 *
	 * A click on a tag: edit the style of the class, or take the class away.
	 */

	private classesSection( subjects: DNode[] ): Component {
		const ids = styleIds( subjects[0] );
		const styles = getStyles( ).filter( style => ids.includes( style.id ) );

		const tags = styles.map( style => new Tag( {
			label: style.name,
			tooltip: "Edit the style of the class, or take it away",
			dom_events: {
				click: ev => new Menu( {
					items: [
						{ text: `Edit the style of "${style.name}"`, click: ( ) => this.edit( style ) },
						{ text: "Remove from the component", click: ( ) => this.setClasses( ids.filter( id => id !== style.id ) ) },
					],
				} ).displayAt( ev.clientX, ev.clientY ),
			},
		} ) );

		const completer = this.completer = new AutoComplete( {
			label: "",
			cls: "completer",
			placeholder: "add a class",
			minChars: 0,

			search: ev => {
				const typed = ev.text.trim( ).toLowerCase( );
				const taken = styleIds( this.props.surface.getSubjects( )[0] ?? subjects[0] );

				ev.setItems( getStyles( )
					.filter( style => !taken.includes( style.id ) && style.name.toLowerCase( ).includes( typed ) )
					.map( style => ( { id: style.id, text: style.name } ) ) );
			},

			// Picked in the list. A name that was only typed is taken with
			// Enter (below), not when the field is left: half a name would
			// make a class.
			change: ev => {
				if( ev.item ) {
					const name = String( ev.item.text );
					asap( ( ) => this.giveClass( name ) );
				}
			},
		} );

		// Enter on a name that is not in the list: the field does nothing of it
		completer.getInput( ).addDOMEvent( "keydown", ev => {
			const name = completer.getInput( ).getValue( ).trim( );

			if( ev.key === "Enter" && !ev.defaultPrevented && name ) {
				ev.preventDefault( );
				asap( ( ) => this.giveClass( name ) );
			}
		} );

		return this.section( "Classes", [new Component( { cls: "tags", content: [...tags, completer] } )] );
	}

	/**
	 * the classes of everything that is selected: one step of the page
	 */

	private setClasses( ids: number[] ): void {
		const surface = this.props.surface;
		surface.setProps( { [STYLES_PROP]: ids.length ? ids : undefined }, surface.getSubjects( ) );
	}

	/**
	 * Give a class to what is selected, by its name. A name no style has
	 * makes a new style, which sets nothing yet.
	 */

	private giveClass( name: string ): void {
		const subjects = this.props.surface.getSubjects( );
		if( !subjects.length || this.editing !== null ) {
			return;
		}

		let style = getStyles( ).find( s => s.name === name );

		if( !style ) {
			if( !isStyleName( name ) ) {
				MessageBox.showAsync( `"${name}" cannot be the name of a class: letters, digits, - and _, not a digit first, and not a name that starts with x4.`, ["ok.outline.default"], "x4studio", "error" );
				return;
			}

			style = { id: nextStyleId( getStyles( ) ), name, values: {} };
			this.props.stylesChange( [...getStyles( ), style], false );
		}

		const ids = styleIds( subjects[0] );
		if( ids.includes( style.id ) ) {
			return;
		}

		// the field is made again with the tags: it takes the focus back, for the next class
		this.refocus = true;
		this.setClasses( [...ids, style.id] );
	}

	// :: THE STYLE OF A CLASS ::::::::::::::::::::::::::::::::::::::::::::::::

	/**
	 * the id of the class whose style is shown; null when it is what is selected on the page
	 */

	getEditing( ): number {
		return this.editing;
	}

	/**
	 * Show the style of a class, to be edited, in place of what is
	 * selected on the page; null to go back to it.
	 */

	editClass( id: number ): void {
		if( id !== this.editing ) {
			this.editing = id;
			this.adding = false;
			this.update( );
			this.props.editingChange( );
		}
	}

	private edit( style: StyleDef ): void {
		this.editClass( style.id );
	}

	private back( ): void {
		this.editClass( null );
	}

	/**
	 * What the inspector shows in place of the selection: the name of the
	 * class, and what is done with it.
	 */

	private classHeader( style: StyleDef ): Component {
		return new HBox( {
			cls: "what class",
			content: [
				new Button( { cls: "outline", label: "‹ Back", tooltip: "Back to what is selected on the page", click: ( ) => this.back( ) } ),
				new Label( { cls: "name", flex: true, text: `.${style.name}` } ),
				new Button( { cls: "outline", label: "Rename", click: ( ) => this.props.renameClass( style ) } ),
				new Button( { cls: "outline", label: "Delete", click: ( ) => this.props.removeClass( style ) } ),
			],
		} );
	}

	private writeStyleValue( style: StyleDef, property: StyleProperty, value: unknown ): void {
		if( value === undefined ) {
			delete style.values[property.name];
		}
		else {
			style.values[property.name] = value;
		}

		this.props.stylesChange( getStyles( ), false );
	}

	private setStyleCss( style: StyleDef, pairs: [string, string][] ): void {
		const css = pairsText( pairs );

		if( css ) {
			style.css = css;
		}
		else {
			delete style.css;
		}

		this.props.stylesChange( getStyles( ), false );
	}

	/**
	 * the declarations of what is selected, from the rows of "Custom": one step of the page
	 */

	private setVars( pairs: [string, string][] ): void {
		const vars: Record<string, string> = {};

		for( const [name, value] of pairs ) {
			if( name && value ) {
				vars[name] = value;
			}
		}

		const surface = this.props.surface;
		surface.setProps( { [VARS_PROP]: Object.keys( vars ).length ? vars : undefined }, surface.getSubjects( ) );
	}

}
