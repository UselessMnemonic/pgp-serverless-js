import Result from '@/utils/Result'

/**
 * A set of utilities for using the AsyncResult type; a Promise which never
 * rejects, instead providing Result values.
 */
namespace AsyncResult {

    /**
     * Represents a successful AsyncResult value
     */
    export type Ok<T> = Promise<Result.Ok<T>>

    /**
     * Represents a failed AsyncResult value
     */
    export type Err<E extends Error = Error> = Promise<Result.Err<E>>

    /**
     * Creates an empty success value.
     */
    export function ok(): Ok<void>

    /**
     * Wraps the given success value.
     */
    export function ok<T>(value: T): Ok<T>

    export function ok(value?: unknown) {
        return Promise.resolve(Result.ok(value))
    }

    /**
     * Creates a failure value by creating a new Error using the given value as the message
     * @param cause The value to convert with String()
     */
    export function err<T extends string | number | bigint | boolean>(cause: T): Err<Error & {message: Stringified<T>}>

    /**
     * Creates a failure value with the given Error as the cause
     * @param cause The Error to wrap
     */
    export function err<E extends Error>(cause: E): Err<E>

    /**
     * Creates a failure value by merging a new Error with the given object.
     * The object is expected to have a `message` property, which is converted to a String
     * if it is not a string.
     * @param cause The value to wrap
     */
    export function err<M, T extends { message: M }>(cause: T): Err<T & Error & {message: Stringified<M>}>

    /**
     * Creates a failure value by merging a new Error with the given object.
     * @param cause The value to wrap
     */
    export function err<T extends {}>(cause: T): Err<T & Error>

    /**
     * Creates a failure value by selecting the most appropriate conversion as described by other overloads.
     * @param cause The value to wrap
     */
    export function err(cause: unknown): Err

    export function err(cause: unknown) {
        return Promise.resolve(Result.err(cause))
    }

    /**
     * Converts a Promise into an AsyncResult which captures reject values.
     * @param promise The promise to wrap
     */
    export async function from<T>(promise: Promise<T>): AsyncResult<Awaited<T>> {
        try {
            const value = await promise
            return Result.ok(value)
        } catch (cause: unknown) {
            return Result.err(cause)
        }
    }

    /**
     * Runs the given function, capturing exceptions thrown during execution or while resolving the Promise result.
     * @param action The action to run
     */
    export async function run<T>(action: () => Promise<T>): AsyncResult<Awaited<T>> {
        try {
            const value = await action()
            return Result.ok(value)
        } catch (cause: unknown) {
            return Result.err(cause)
        }
    }

    /**
     * Creates a function that wraps the given function, taking the same parameters and returning an AsyncResult value.
     * @param fn The function to wrap
     */
    export function wrap<P extends [...unknown[]], R>(fn: (...args: [...P]) => Promise<R>): (...args: [...P]) => AsyncResult<Awaited<R>> {
        async function wrapped(...args: [...P]): AsyncResult<Awaited<R>> {
            try {
                const value = await fn(...args)
                return Result.ok(value)
            } catch (cause: unknown) {
                return Result.err(cause)
            }
        }
        return wrapped
    }
}

/**
 * A type representing an asynchronous Result value served behind a Promise
 */
type AsyncResult<T, E extends Error = Error> = Promise<Result<T, E>>

export default AsyncResult
