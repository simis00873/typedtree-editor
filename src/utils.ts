﻿export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function clamp(num: number, min: number, max: number): number {
    return num < min ? min : (num > max ? max : num);
}

export function half(num: number): number {
    return num * .5;
}

export function add(a: number, b: number): number {
    return a + b;
}

export function subtract(a: number, b: number): number {
    return a - b;
}

export function assertNever(x: never): never {
    throw new Error(`Unexpected object: ${x}`);
}