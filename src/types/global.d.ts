declare global {
    /**
     * A simple type for expressing String conversions.
     */
    export type Stringified<T> = T extends string ? T : T extends (number | bigint | boolean | null) ? `${T}` : string
}

export {}
