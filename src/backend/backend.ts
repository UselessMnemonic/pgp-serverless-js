import assert from 'assert'
import process from 'process'
import Stream from 'stream'
import Result from '@/utils/Result';
import AsyncResult from '@/utils/AsyncResult';
import {AsyncResultGenerator} from '@/utils/AsyncResultIterators';
import {AttributeValue, DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand} from '@aws-sdk/client-dynamodb'
import {GetObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {HEX_REGEX} from '@/utils/constants'
import {KeyMetadata, SearchingLookup} from './types'

const {PGP_TABLE_NAME, PGP_BUCKET_NAME} = process.env
assert.ok(PGP_TABLE_NAME, 'PGP_TABLE_NAME is not defined')
assert.ok(PGP_BUCKET_NAME, 'PGP_BUCKET_NAME is not defined')
const PGP_TABLE_PAGE_LIMIT = process.env['PGP_TABLE_PAGE_LIMIT'] ? Number(process.env['PGP_TABLE_PAGE_LIMIT']) : undefined

const DYNAMO = new DynamoDBClient()
const S3 = new S3Client()

/**
 * Attempts to guess what type of search to conduct: fingerprint, id, or (primary) user id
 */
export async function* searchKeysByBestGuess(lookup: SearchingLookup): AsyncGenerator<KeyMetadata, Result<void>, void> {
    const match = lookup.search.match(HEX_REGEX)
    if (match === null ) {
        return yield* searchKeysByKeyword(lookup)
    }

    lookup.search = match[1]  // consequence is all '0x' hex strings are 'normalized'
    if (lookup.search.length === 32 || lookup.search.length === 40 || lookup.search.length === 64) {
        const result = await findKeyByFingerprint(lookup)
        if (Result.isErr(result)) {
            return result
        }
        if (Result.isPresent(result)) {
            yield result.value
        }
        return Result.ok()
    }
    if (lookup.search.length === 16) {
        return yield* searchKeysById(lookup)
    }
    return yield* searchKeysByKeyword(lookup)
}

/**
 * Searches for a key by its id
 * ids are 16 digits long, prefixed by '0x'
 * Two keys may have the same ID, in fact, albeit unlikely
 */
export function searchKeysById(lookup: SearchingLookup) {
    const request = new QueryCommand({
        TableName: PGP_TABLE_NAME,
        KeyConditionExpression: 'pgpKeyId = :term',
        ExpressionAttributeValues: {
            ':term': {
                S: lookup.search.toUpperCase()
            }
        },
        Limit: PGP_TABLE_PAGE_LIMIT
    })
    return AsyncResultGenerator.from<KeyMetadata, void, void>(async function* () {
        let response = await DYNAMO.send(request)
        while (true) {
            if (response.Items !== undefined) {
                for (const i of response.Items) {
                    yield extractKeyMetadata(i)
                }
            }
            if (response.LastEvaluatedKey === undefined) {
                break
            }
            request.input.ExclusiveStartKey = response.LastEvaluatedKey
            response = await DYNAMO.send(request)
        }
    }())
}

/**
 * Searches for keys whose primary user IDs, fingerprints, or ids contain the given text
 */
export function searchKeysByKeyword(lookup: SearchingLookup) {
    const request = new ScanCommand({
        TableName: PGP_TABLE_NAME,
        FilterExpression: lookup.exact ? 'primaryUserId = :term' :
            'contains(primaryUserId, :term) OR contains(pgpKeyId, :term) OR contains(pgpFingerprintUpper, :term)',
        ExpressionAttributeValues: {
            ':term': {
                S: lookup.search
            }
        },
        Limit: PGP_TABLE_PAGE_LIMIT
    })
    return AsyncResultGenerator.from<KeyMetadata, void, void>(async function* () {
        let response = await DYNAMO.send(request)
        while (true) {
            if (response.Items !== undefined) {
                for (const i of response.Items) {
                    yield extractKeyMetadata(i)
                }
            }
            if (response.LastEvaluatedKey === undefined) {
                break
            }
            request.input.ExclusiveStartKey = response.LastEvaluatedKey
            response = await DYNAMO.send(request)
        }
    }())
}

/**
 * Searches for a key by its fingerprint
 * fingerprints are digests: 32 (v3), 40 (v4), or 64 (v6) hex digits long, prefixed by '0x'
 */
export async function findKeyByFingerprint(lookup: SearchingLookup): AsyncResult<KeyMetadata | undefined> {
    const request = new GetItemCommand({
        TableName: PGP_TABLE_NAME,
        Key: {
            'pgpKeyId': {
                'S': lookup.search.slice(-16).toUpperCase()
            },
            'pgpFingerprintUpper': {
                'S': lookup.search.slice(0, -16).toUpperCase()
            }
        }
    })
    return AsyncResult.run(async () => {
        const response = await DYNAMO.send(request)
        if (response.Item === undefined) {
            return undefined
        }
        return extractKeyMetadata(response.Item)
    })
}

/**
 * Prepares a stream for reading the key's data
 */
export function getKeyDataStream(keyMeta: KeyMetadata): AsyncResult<Stream.Readable | undefined> {
    const request = new GetObjectCommand({
        Bucket: PGP_BUCKET_NAME,
        Key: keyMeta.fingerprint
    })
    return AsyncResult.run(async () => {
        const response = await S3.send(request)
        return response.Body as Stream.Readable | undefined
    })
}

function extractKeyMetadata(item: Record<string, AttributeValue>): KeyMetadata {
    const result = unfoldAttributes(item)
    assert.ok(typeof result.pgpKeyId === 'string')
    assert.ok(typeof result.pgpFingerprintUpper === 'string')
    assert.ok(typeof result.primaryUserId === 'string')

    result.id = result.pgpKeyId
    result.fingerprint = result.pgpFingerprintUpper + result.pgpKeyId
    delete result.pgpKeyId
    delete result.pgpFingerprintUpper

    return result as KeyMetadata
}

function unfoldAttributes(item: Record<string, AttributeValue>) {
    const result: Record<string, unknown> = {}
    for (const k in item) {
        const attr = item[k]
        if (attr.B !== undefined) {
            result[k] = attr.B
        } else if (attr.BOOL !== undefined) {
            result[k] = attr.BOOL
        } else if (attr.BS !== undefined) {
            result[k] = attr.BS
        } else if (attr.L !== undefined) {
            result[k] = attr.L
        } else if (attr.M !== undefined) {
            result[k] = attr.M
        } else if (attr.N !== undefined) {
            result[k] = attr.N
        } else if (attr.NS !== undefined) {
            result[k] = attr.NS
        } else if (attr.NULL !== undefined) {
            result[k] = null
        } else if (attr.S !== undefined) {
            result[k] = attr.S
        } else if (attr.SS !== undefined) {
            result[k] = attr.SS
        } else if (attr.$unknown !== undefined) {
            result[k] = attr.$unknown
        }
    }
    return result
}
