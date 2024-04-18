import stream from 'stream'
import * as backend from '@/backend/backend'
import * as format from './formatters'
import Result from '@/utils/Result'
import HTTPStatusCode from '@/utils/HTTPStatusCode'
import LookupHandlers from './handlers'
import {KeyMetadata, Lookup, SearchingLookup} from '@/backend/types'
import {BadLookupError, EmptyLookupError, NoDataError, UnknownOperationError} from './exceptions'
import {APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2} from 'aws-lambda';
import {HEX_REGEX} from '@/utils/constants';
import {findKeyByFingerprint} from '@/backend/backend';

/**
 * Like get, but retrieves metadata only
 */
const index = LookupHandlers.addOperation('index', async (lookup) => {
    if (!SearchingLookup.is(lookup)) {
        return Result.err(new BadLookupError('missing search'))
    }

    const keyMetas = backend.searchKeysByBestGuess(lookup)
    return await format.formatIndices(lookup, keyMetas)
})
LookupHandlers.addOperation('vindex', index)

/**
 * Best guess search
 */
LookupHandlers.addOperation('get', async (lookup) => {
    if (!SearchingLookup.is(lookup)) {
        return Result.err(new BadLookupError('missing search'))
    }

    const keyMetas = backend.searchKeysByBestGuess(lookup)
    const keyStreams = generateKeyStreams(keyMetas)

    return await format.formatKeys(keyStreams)
})

/**
 * Like 'get' but using fingerprints
 */
LookupHandlers.addOperation('hget', async (lookup) => {
    if (!SearchingLookup.is(lookup)) {
        return Result.err(new BadLookupError('missing search'))
    }

    const match = lookup.search.match(HEX_REGEX)
    if (match === null) {
        return Result.err(new BadLookupError(`invalid hex string format ${lookup.search}`))
    }

    lookup.search = match[1]  // consequence is all '0x' hex strings are 'normalized'
    if (lookup.search.length !== 32 && lookup.search.length !== 40 && lookup.search.length !== 64) {
        return Result.err(new BadLookupError(`invalid hex string length ${lookup.search}`))
    }

    const keyMetaResult = await findKeyByFingerprint(lookup)
    if (Result.isErr(keyMetaResult)) {
        return keyMetaResult
    }

    const keyStreams = generateKeyStreams(async function* () {
        if (keyMetaResult.value !== undefined) {
            yield keyMetaResult.value
        }
        return Result.ok()
    }())
    return await format.formatKeys(keyStreams)
})

/**
 * lambda entry point
 */
export const lookup: APIGatewayProxyHandlerV2 = async (event): Promise<APIGatewayProxyStructuredResultV2> => {
    if (!event.queryStringParameters) {
        return formatError(new BadLookupError('missing parameters'))
    }
    const {
        v,
        search,
        exact
    } = event.queryStringParameters
    const op = event.queryStringParameters['op']?.trim()
    const options = event.queryStringParameters['options']?.split(',')

    if (v !== undefined && v !== '1') {
        return formatError(new BadLookupError(`unsupported version ${v}`))
    }

    if (op === undefined || op.length === 0) {
        return formatError(new BadLookupError('missing operation'))
    }

    const handler = LookupHandlers.getOperation(op)
    if (handler === undefined) {
        return formatError(new UnknownOperationError(`unknown operation ${op}`))
    }

    const lookup: Lookup = {
        op, search, options, exact: exact === 'on'
    }

    const result = await handler(lookup)
    if (Result.isErr(result)) {
        return formatError(result.cause)
    }

    const structuredResult = result.value
    if (structuredResult.body === undefined || structuredResult.body.length === 0) {
        return formatError(new EmptyLookupError(`no keys matching '${lookup.search}'`))
    }
    return structuredResult
}

async function* generateKeyStreams(keyMetas: AsyncGenerator<KeyMetadata, Result<void>, void>): AsyncGenerator<stream.Readable, Result<void>, void> {
    let next = await keyMetas.next()
    while(!next.done) {
        const streamResult = await backend.getKeyDataStream(next.value)
        if (Result.isPresent(streamResult)) {
            yield streamResult.value
        }
        next = await keyMetas.next()
    }
    return next.value
}

function formatError(error: Error): APIGatewayProxyStructuredResultV2 {
    const result: APIGatewayProxyStructuredResultV2 = {
        statusCode: HTTPStatusCode.InternalServerError,
        body: JSON.stringify(error, Object.getOwnPropertyNames(error))
    }
    if (error instanceof BadLookupError) result.statusCode = HTTPStatusCode.BadRequest
    if (error instanceof EmptyLookupError) result.statusCode = HTTPStatusCode.NotFound
    if (error instanceof UnknownOperationError) result.statusCode = HTTPStatusCode.NotImplemented
    if (error instanceof NoDataError) result.statusCode = HTTPStatusCode.InternalServerError

    return result
}
