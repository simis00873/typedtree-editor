/**
 * @file Responsible for creating svg display elements and updating them.
 */

import * as Utils from "./utils";
import * as DomUtils from "./domutils";
import * as Vec from "./vector";
import * as SvgJs from "svg.js";
import { ClassName } from "./domutils";

declare const SVG: typeof SvgJs;

/** Display element that content can be added to. */
export interface Element {
    /** Html class identifier for this element */
    readonly className: string
    /** Position of this element.
     * Note: This does NOT need to match screen pixels as the canvas can be zoomed. */
    readonly position: Vec.Position

    /** Add a child element */
    addElement(className: ClassName, position: Vec.Position): Element

    /** Add a rectangle graphic to this element. */
    addRect(className: ClassName, size: Vec.Size, position: Vec.Position): void

    /** Add a text graphic to this element.
     * Note: Position is vertically centered. */
    addText(className: ClassName, text: string, position: Vec.Position): void

    /** Add a editable text graphic to this element.
     * Note: Position is vertically centered. */
    addEditableText(
        className: ClassName,
        value: string,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: string) => void): void

    /** Add a editable number graphic to this element.
     * Note: Position is vertically centered. */
    addEditableNumber(
        className: ClassName,
        value: number,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: number) => void): void

    /** Add a editable boolean graphic to this element.
     * Note: Position is vertically centered. */
    addEditableBoolean(
        className: ClassName,
        value: boolean,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: boolean) => void): void

    /** Add a line graphic to this element. */
    addLine(className: ClassName, from: Vec.Position, to: Vec.Position): void

    /** Add a bezier graphic to this element. */
    addBezier(className: ClassName, from: Vec.Position, c1: Vec.Position, c2: Vec.Position, to: Vec.Position): void

    /** Add a external graphic to this element. */
    addGraphics(
        className: ClassName,
        graphicsId: string,
        position: Vec.Position,
        clickCallback?: (() => void)): void
}

/** Initialize the display, needs to be done once. */
export function initialize(): void {
    if (svgDocument != null || svgRoot != null)
        throw new Error("Already initialized");

    const rootSvgDom = document.getElementById(rootSvgDomElementId);
    if (rootSvgDom === null)
        throw new Error(`No dom element found with id: ${rootSvgDomElementId}`);

    if (!SVG.supported)
        throw new Error("Svg not supported");

    // Create document
    svgDocument = SVG(rootSvgDomElementId);
    svgRoot = svgDocument.group();

    // Setup global listeners
    const inputBlocker = document.getElementById(inputBlockerDomElementId);
    rootSvgDom.ondragstart = _ => false; // Disable native dragging as it interferes with ours.
    rootSvgDom.onmousedown = event => {
        if (document.activeElement !== null && document.activeElement.tagName === "INPUT")
            return;
        dragOffset = Vec.subtract(viewOffset, { x: event.clientX, y: event.clientY });
        dragging = true;

    };
    window.onmouseup = () => {
        dragging = false;
        if (inputBlocker !== null)
            inputBlocker.className = "order-back";
    };
    window.onmousemove = event => {
        if (document.activeElement !== null && document.activeElement.tagName === "INPUT") {
            dragging = false;
            return;
        }
        if (dragging) {
            if (inputBlocker !== null)
                inputBlocker.className = "order-front";
            setOffset(Vec.add(dragOffset, { x: event.clientX, y: event.clientY }));
        }
    };
    rootSvgDom.onwheel = event => {
        if (document.activeElement !== null && document.activeElement.tagName === "INPUT")
            return;

        // Get data from the event
        const scrollDelta = -(<WheelEvent>event).deltaY * scrollScaleSpeed;
        const pointerPos: Vec.Position = { x: (<WheelEvent>event).pageX, y: (<WheelEvent>event).pageY };

        // Calculate new-scale and offset to zoom-in to where the user was pointing
        const newScale = clampScale(scale + scrollDelta);
        const zoomFactor = (newScale - scale) / scale;
        const offsetToPointer = Vec.subtract(pointerPos, viewOffset);
        const offsetDelta = Vec.multiply(offsetToPointer, -zoomFactor);

        // Apply new scale and offset
        viewOffset = Vec.add(viewOffset, offsetDelta);
        scale = newScale;
        updateRootTransform();
    };
}

/**
 * Create a new root display element.
 * @param className Html class identifier for this element.
 * @param  position Position to place the element at.
 * @returns Element
 */
export function createElement(className: ClassName, position: Vec.Position): Element {
    assertInitialized();
    return new GroupElement(svgRoot!, className, position);
}

/**
 * Provide a root offset of the content. (Will be used for centering)
 * @param offset Offset to use for centering content
 */
export function setContentOffset(offset: Vec.Position): void {
    contentOffset = offset;
}

/** Focus on the current content (Will be centered and scaled to fit). */
export function focusContent(): void {
    assertInitialized();
    const displaySize = Vec.subtract(getDisplaySize(), displayMargin);
    const contentSize = getContentSize();

    // Calculate new scale
    setScale(Math.min(displaySize.x / contentSize.x, displaySize.y / contentSize.y));

    // Calculate offset to center the content
    const scaledContentSize = Vec.multiply(contentSize, scale);
    const scaledContentOffset = Vec.multiply(contentOffset, scale);
    const centeringOffset = Vec.add(
        Vec.half(Vec.subtract(displaySize, scaledContentSize)),
        Vec.invert(scaledContentOffset));
    setOffset(Vec.add(halfDisplayMargin, centeringOffset));
}

/** Clear all content from this display. */
export function clear(): void {
    assertInitialized();
    svgRoot!.clear();
}

const rootSvgDomElementId = "svg-display";
const inputBlockerDomElementId = "input-blocker";
const graphicsFilePath = "graphics.svg";
const minScale = 0.05;
const maxScale = 3;
const scrollScaleSpeed = 0.001;
const displayMargin: Vec.Vector2 = { x: 75, y: 75 };
const halfDisplayMargin = Vec.half(displayMargin);

let svgDocument: SvgJs.Doc | undefined;
let svgRoot: SvgJs.G | undefined;
let viewOffset = Vec.zeroVector;
let contentOffset = Vec.zeroVector;
let scale = 1;
let dragging = false;
let dragOffset = Vec.zeroVector;

class GroupElement implements Element {
    private readonly _svgGroup: SvgJs.G;
    private readonly _className: ClassName;
    private readonly _position: Vec.Position;

    constructor(svgContainer: SvgJs.Container, className: ClassName, position: Vec.Position) {
        this._svgGroup = svgContainer.group().x(position.x).y(position.y);
        this._className = className;
        this._position = position;
    }

    get className(): ClassName {
        return this._className;
    }

    get position(): Vec.Position {
        return this._position;
    }

    addElement(className: ClassName, position: Vec.Position): Element {
        return new GroupElement(this._svgGroup, className, position);
    }

    addRect(className: ClassName, size: Vec.Size, position: Vec.Position): void {
        this._svgGroup.rect(size.x, size.y).
            x(position.x).
            y(position.y).
            addClass(className);
    }

    addText(className: ClassName, text: string, position: Vec.Position): void {
        this._svgGroup.group().
            x(position.x).
            y(position.y).
            text(b => {
                /* NOTE: Using dy offset here to center vertically, reason why we not just use:
                'dominant-baseline' is that its not supported on edge */

                b.tspan(text).dy("0.6ex");
            }).
            addClass(className).
            addClass("noselect");
    }

    addEditableText(
        className: ClassName,
        value: string,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: string) => void): void {

        const inputElement = DomUtils.createTextInput(value, callback);
        inputElement.className = className;

        this._svgGroup.group().
            element("foreignObject").
            x(position.x).
            /* HACK: Ugly +2 here because i can't figure out why it seems to draw slightly too high on
            most browsers */
            y(position.y - Utils.half(size.y) + 2).
            width(size.x).
            height(size.y).
            node.appendChild(inputElement);
    }

    addEditableNumber(
        className: ClassName,
        value: number,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: number) => void): void {

        const inputElement = DomUtils.createNumberInput(value, callback);
        inputElement.className = className;

        this._svgGroup.group().
            element("foreignObject").
            x(position.x).
            /* HACK: Ugly +2 here because i can't figure out why it seems to draw slightly too high on
            most browsers */
            y(position.y - Utils.half(size.y) + 2).
            width(size.x).
            height(size.y).
            node.appendChild(inputElement);
    }

    addEditableBoolean(
        className: ClassName,
        value: boolean,
        position: Vec.Position,
        size: Vec.Size,
        callback: (newValue: boolean) => void): void {

        const inputElement = DomUtils.createBooleanInput(value, callback);
        inputElement.className = className;

        this._svgGroup.group().
            element("foreignObject").
            x(position.x).
            /* HACK: Ugly +2 here because i can't figure out why it seems to draw slightly too high on
            most browsers */
            y(position.y - Utils.half(size.y) + 2).
            width(size.x).
            height(size.y).
            node.appendChild(inputElement);
    }

    addLine(className: ClassName, from: Vec.Position, to: Vec.Position): void {
        this._svgGroup.line(from.x, from.y, to.x, to.y).
            addClass(className);
    }

    addBezier(className: ClassName, from: Vec.Position, c1: Vec.Position, c2: Vec.Position, to: Vec.Position): void {
        this._svgGroup.path(`M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`).
            addClass(className);
    }

    addGraphics(
        className: ClassName,
        graphicsId: string,
        position: Vec.Position,
        clickCallback?: () => void): void {

        const elem = this._svgGroup.use(graphicsId, graphicsFilePath).
            addClass(className).
            x(position.x).
            y(position.y);
        if (clickCallback !== undefined)
            elem.click(clickCallback);
    }
}

/** Get the size of the current window */
function getDisplaySize(): Vec.Vector2 {
    assertInitialized();
    const bounds = svgDocument!.rbox();
    return { x: bounds.width, y: bounds.height };
}

/** Get the total size of the current content */
function getContentSize(): Vec.Vector2 {
    assertInitialized();
    const contentSize = svgRoot!.bbox();
    return { x: contentSize.width, y: contentSize.height };
}

/**
 * Set the global content scale (Can be used for zooming).
 * @param newScale New global content scale.
 */
function setScale(newScale: number): void {
    assertInitialized();
    scale = clampScale(newScale);
    updateRootTransform();
}

/**
 * Set the new global offset (Can be used to pan the content).
 * @param newOffset New global offset.
 */
function setOffset(newOffset: Vec.Vector2): void {
    assertInitialized();
    viewOffset = newOffset;
    updateRootTransform();
}

function updateRootTransform(): void {
    svgRoot!.node.setAttribute("transform", `translate(${viewOffset.x}, ${viewOffset.y})scale(${scale})`);
}

function clampScale(newScale: number): number {
    return Utils.clamp(newScale, minScale, maxScale);
}

function assertInitialized(): void {
    if (svgDocument === undefined || svgRoot === undefined)
        throw new Error("Display hasn't been initialized");
}