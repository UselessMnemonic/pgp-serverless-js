import stream from 'stream'
import HTTPStatusCode from '@/utils/HTTPStatusCode'
import AsyncResult from '@/utils/AsyncResult';
import Result from '@/utils/Result';
import {KeyMetadata, SearchingLookup} from '@/backend/types'
import {APIGatewayProxyStructuredResultV2} from 'aws-lambda';

/**
 * Prepares the lambda response according to the keyring format:
 * --- BEGIN BLOCK ---
 * ...
 * ---END BLOCK ---
 * ...
 */
export async function formatKeys(
    keyStreams: AsyncGenerator<stream.Readable, Result<void>, void>
): AsyncResult<APIGatewayProxyStructuredResultV2> {
    const structuredResult: APIGatewayProxyStructuredResultV2 = {
        statusCode: HTTPStatusCode.OK,
        headers: {
            'Content-Type': 'application/pgp-keys'
        }
    }
    const chunks: Buffer[] = []
    let nextStream = await keyStreams.next()
    while (!nextStream.done) {
        const keyStream = nextStream.value
        // assuming all keys have trailing newline
        try {
            for await (const nextChunk of keyStream) {
                if (nextChunk instanceof Buffer) {
                    chunks.push(nextChunk)
                } else {
                    chunks.push(Buffer.from(nextChunk))
                }
            }
        } catch (cause: unknown) {
            return Result.err(cause)
        }
        nextStream = await keyStreams.next()
    }
    if (Result.isOk(nextStream.value)) {
        structuredResult.body = Buffer.concat(chunks).toString()
        return Result.ok(structuredResult)
    }
    return nextStream.value
}

/**
 * Prepares the lambda response according to the index format:
 * info:<version>:<count>
 * pub:<keyid>:<algorithm>:<keylen>:<creationdate>:<expirationdate>:<flags>:<version>
 *   uid:<uidstring>:<creationdate>:<expirationdate>:<flags>
 *   ...
 * ...
 *
 * we will be omitting 'info' line since we're always streaming
 */
export async function formatIndices(
    lookup: SearchingLookup,
    keyMetas: AsyncGenerator<KeyMetadata, Result<void>, void>
): AsyncResult<APIGatewayProxyStructuredResultV2> {
    const isMachine = lookup.options == undefined || lookup.options.includes('mr') || !lookup.options.includes('json')
    const structuredResult: APIGatewayProxyStructuredResultV2 = {
        statusCode: HTTPStatusCode.OK,
        headers: {
            'Content-Type': isMachine ? 'text/plain' : 'application/json'
        }
    }
    const formatResult = isMachine ? await formatMachineIndices(keyMetas) : await formatJsonIndices(keyMetas)
    if (Result.isErr(formatResult)) {
        return formatResult
    }
    structuredResult.body = formatResult.value
    return Result.ok(structuredResult)
}

async function formatMachineIndices(keyMetas: AsyncGenerator<KeyMetadata, Result<void>, void>): AsyncResult<string> {
    const chunks: Buffer[] = []
    let next = await keyMetas.next()
    while (!next.done) {
        const keyMeta = next.value
        const line = `pub:${keyMeta.fingerprint}\nuid:${encodeURIComponent(keyMeta.primaryUserId)}\n`
        chunks.push(Buffer.from(line))
        next = await keyMetas.next()
    }
    if(Result.isErr(next.value)) {
        return next.value
    }
    return Result.ok(Buffer.concat(chunks).toString())
}

async function formatJsonIndices(keyMetas: AsyncGenerator<KeyMetadata, Result<void>, void>): AsyncResult<string> {
    let next = await keyMetas.next()
    const indices: Record<string, KeyMetadata> = {}
    while (!next.done) {
        const keyMeta = next.value
        indices[keyMeta.fingerprint] = keyMeta
        next = await keyMetas.next()
    }
    if(Result.isErr(next.value)) {
        return next.value
    }
    return Result.ok(JSON.stringify(indices))
}
