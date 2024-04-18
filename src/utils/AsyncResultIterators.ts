import Result from '@/utils/Result'

export interface AsyncResultIterator<T, TReturn = any, TNext = undefined> extends AsyncIterator<T, Result<TReturn>, TNext> {
    next(...args: [] | [TNext]): Promise<IteratorResult<T, Result<TReturn>>>;
    return?(value?: Result<TReturn> | PromiseLike<Result<TReturn>>): Promise<IteratorResult<T, Result<TReturn>>>;
    throw?(e?: any): Promise<IteratorResult<T, Result<TReturn>>>;
}

export interface AsyncResultIterable<T> extends AsyncIterable<T> {
    [Symbol.asyncIterator](): AsyncResultIterator<T>;
}

export interface AsyncResultIterableIterator<T> extends AsyncResultIterator<T> {
    [Symbol.asyncIterator](): AsyncResultIterableIterator<T>;
}

export interface AsyncResultGenerator<T, TReturn = any, TNext = undefined> extends AsyncResultIterator<T, TReturn, TNext> {
    // NOTE: 'next' is defined using a tuple to ensure we report the correct assignability errors in all places.
    next(...args: [] | [TNext]): Promise<IteratorResult<T, Result<TReturn>>>;
    return(value: Result<TReturn> | PromiseLike<Result<TReturn>>): Promise<IteratorResult<T, Result<TReturn>>>;
    throw(e: any): Promise<IteratorResult<T, Result<TReturn>>>;
    [Symbol.asyncIterator](): AsyncResultGenerator<T, TReturn, TNext>;
}

/**
 * A generator which never throws and returns Result values instead.
 */
export namespace AsyncResultGenerator {

    function wrapIteratorResult<T, TReturn>(result: IteratorResult<T, TReturn>): IteratorResult<T, Result<TReturn>> {
        if (result.done === true) {
            return {done: true, value: Result.ok(result.value)}
        }
        return result
    }

    /**
     * Creates an AsyncResultGenerator by wrapping the given AsyncGenerator
     * @param generator The Generator to wrap
     */
    export function from<T, TReturn, TNext>(generator: AsyncGenerator<T, TReturn, TNext>): AsyncResultGenerator<T, TReturn, TNext> {
        const wrappedGenerator: AsyncResultGenerator<T, TReturn, TNext> = {
            async next(...args: [] | [TNext]) {
                try {
                    const iteratorResult = await generator.next(...args)
                    return wrapIteratorResult(iteratorResult)
                } catch (cause: unknown) {
                    return {done: true, value: Result.err(cause)}
                }
            },
            async throw(cause) {
                try {
                    const iteratorResult = await generator.throw(cause)
                    return wrapIteratorResult(iteratorResult)
                } catch (cause: unknown) {
                    return {done: true, value: Result.err(cause)}
                }
            },
            async return(arg) {
                try {
                    // If the argument fails, we pretend as if the user called throw()
                    try {
                        arg = await arg
                    } catch (cause: unknown) {
                        const iteratorResult = await generator.return(Promise.reject(cause))
                        return wrapIteratorResult(iteratorResult)
                    }
                    // If the argument is a Result.Err, we pretend as if the user called throw()
                    if (Result.isErr(arg)) {
                        const iteratorResult = await generator.return(Promise.reject(arg.cause))
                        return wrapIteratorResult(iteratorResult)
                    }
                    const iteratorResult = await generator.return(arg.value)
                    return wrapIteratorResult(iteratorResult)
                } catch (cause: unknown) {
                    return {done: true, value: Result.err(cause)}
                }
            },
            [Symbol.asyncIterator]() {
                return wrappedGenerator
            }
        }
        return wrappedGenerator
    }

    /**
     * Wraps an AsyncGenerator function and returns another function taking the same parameters.
     * @param fn The function to wrap; if it throws while the AsyncGenerator is being constructed, then the generator
     * created by the wrapping function will immediately finish with a Result.Err return.
     */
    export function wrap<P extends [...unknown[]], T, TReturn, TNext>(fn: (...args: [...P]) => AsyncGenerator<T, TReturn, TNext>): (...args: [...P]) => AsyncResultGenerator<T, TReturn, TNext> {
        function wrapped(...args: [...P]) {
            try {
                const generator = fn(...args)
                return from(generator)
            } catch (cause: unknown) {
                return async function * () {
                    return Result.err(cause)
                } ()
            }
        }
        return wrapped
    }
}
