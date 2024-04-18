import AsyncResult from '@/utils/AsyncResult'
import {Lookup} from '@/backend/types'
import {APIGatewayProxyStructuredResultV2} from 'aws-lambda'

namespace LookupHandlers {

    type LookupHandler = (lookup: Lookup) => AsyncResult<APIGatewayProxyStructuredResultV2>

    const handlers: Record<string, LookupHandler | undefined> = {}

    export function getOperation(op: string) {
        return handlers[op]
    }

    export function addOperation(op: string, handler: LookupHandler) {
        handlers[op] = handler
        return handler
    }
}

export default LookupHandlers
