/**
 * Container for lookup parameters.
 */
export type Lookup = {
    op: string
    search?: string
    options?: string[]
    exact: boolean
}

export type SearchingLookup = Lookup & {
    search: string
}

export namespace SearchingLookup {
    export function is(it: Lookup): it is SearchingLookup {
        return it.search !== undefined
    }
}

/**
 * Container for PGP key metadata.
 */
export type KeyMetadata = Record<string, unknown> & {
    id: string
    fingerprint: string
    primaryUserId: string
}
