/**
 * Utilities for Async Generators
 */
namespace AsyncGenerators {

    /**
     * Runs a block accepting the given generator and returns the generator's return value.
     * The given block may return a value of its own, which will be used as the result.
     * @param generator The generator that will be passed to the block
     * @param block The function which consumes the given generator
     */
    export async function run<T, TReturn1, TReturn2, TNext>(generator: AsyncGenerator<T, TReturn1, TNext>, block: (it: AsyncGenerator<T, TReturn1, TNext>) => Promise<void | IteratorReturnResult<TReturn1 | TReturn2>>): Promise<TReturn1 | TReturn2> {
        // wrap iterator to intercept ReturnResults
        const resultContainer: { result: IteratorReturnResult<TReturn1 | TReturn2> | undefined } = { result: undefined }
        const wrappedGenerator: AsyncGenerator<T, TReturn1, TNext> = {
            async next(...args) {
                const result = await generator.next(...args)
                if (result.done) {
                    resultContainer.result = result
                }
                return result
            },
            async throw (cause) {
                const result = await generator.throw(cause)
                if (result.done) {
                    resultContainer.result = result
                }
                return result
            },
            async return (arg) {
                const result = await generator.return(arg)
                if (result.done) {
                    resultContainer.result = result
                }
                return result
            },
            [Symbol.asyncIterator]() {
                return wrappedGenerator
            }
        }

        // run block for result
        const blockResult = await block(wrappedGenerator)
        if (blockResult) return blockResult.value
        return resultContainer.result!.value
    }
}

export default AsyncGenerators
