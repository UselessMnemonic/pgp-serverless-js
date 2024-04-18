/**
 * A simple Result type
 */
namespace Result {

    /**
     * Represents a successful Result value
     */
    export type Ok<T> = T extends never ? never : {
        readonly value: T
    }

    /**
     * Represents a failed Result value
     */
    export type Err<E extends Error = Error> = E extends never ? never : {
        readonly cause: E
    }

    /**
     * Creates an empty success value.
     */
    export function ok(): Ok<void>

    /**
     * Wraps the given success value.
     */
    export function ok<T>(value: T): Ok<T>

    export function ok(value?: unknown): Ok<unknown> {
        return { value }
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

    export function err(cause: unknown): Err {
        if (cause === null || cause === undefined) {
            return { cause: new Error() }
        }
        if (typeof cause === 'string') {
            return { cause: new Error(cause) }
        }
        if (typeof cause !== 'object') {
            const message = String(cause)
            return { cause: new Error(message) }
        }
        if (cause instanceof Error) {
            return { cause }
        }
        if ('message' in cause) {
            const message = typeof cause.message === 'string' ? cause.message : String(cause.message)
            return { cause: { ...cause, ...new Error(message) } }
        }
        return { cause: { ...cause, ...new Error() } }
    }

    /**
     * Determines if the given Result is a success value.
     */
    export function isOk<T, E extends Error>(result: Result<T, E>): result is Ok<T> {
        return 'value' in result
    }

    /**
     * Determines if the given Result is a failure value.
     * @param result
     */
    export function isErr<T, E extends Error>(result: Result<T, E>): result is Err<E> {
        return !('value' in result)
    }

    /**
     * Determines if the given Result is neither a null nor an undefined success value.
     * @param result
     */
    export function isPresent<T extends {}, E extends Error>(result: Result<T | undefined | null, E>): result is Ok<T> {
        return ('value' in result) && (result.value !== undefined) && (result.value !== null)
    }

    /**
     * Runs the given function, capturing exceptions thrown during execution.
     * @param action The action to run
     */
    export function run<T>(action: () => T): Result<T> {
        try {
            const value = action()
            return Result.ok(value)
        } catch (cause: unknown) {
            return Result.err(cause)
        }
    }

    /**
     * Throws the Error contained within the given Result.
     */
    export function expect(result: Err): never

    /**
     * Returns the success value contained within the given Result if the Result is a success value.
     * Otherwise, the underlying Error is thrown.
     */
    export function expect<T>(result: Result<T>): T

    export function expect<T>(result: Result<T>) {
        if ('value' in result) return result.value
        throw result.cause
    }

    /**
     * Creates a function that wraps the given function, taking the same parameters and returning a Result value.
     * @param fn The function to wrap
     */
    export function wrap<P extends [...unknown[]], R>(fn: (...args: [...P]) => R): (...args: [...P]) => Result<R> {
        return function (...args: [...P]): Result<R> {
            try {
                const value = fn(...args)
                return Result.ok(value)
            } catch (cause: unknown) {
                return Result.err(cause)
            }
        }
    }
}

/**
 * A type representing a Result value
 */
type Result<T, E extends Error = Error> = Result.Ok<T> | Result.Err<E>

export default Result
