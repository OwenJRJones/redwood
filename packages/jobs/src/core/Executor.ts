// Used by the job runner to execute a job and track success or failure

import console from 'node:console'

import type { BaseAdapter } from '../adapters/BaseAdapter'
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_DELETE_FAILED_JOBS } from '../consts'
import {
  AdapterRequiredError,
  JobRequiredError,
  JobExportNotFoundError,
} from '../errors'
import { loadJob } from '../loaders'
import type { BasicLogger } from '../types'

interface Options {
  adapter: BaseAdapter
  job: any
  logger?: BasicLogger
  maxAttempts?: number
  deleteFailedJobs?: boolean
}

interface DefaultOptions {
  logger: BasicLogger
  maxAttempts: number
  deleteFailedJobs: boolean
}

type CompleteOptions = Options & DefaultOptions

export const DEFAULTS: DefaultOptions = {
  logger: console,
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  deleteFailedJobs: DEFAULT_DELETE_FAILED_JOBS,
}

export class Executor {
  options: CompleteOptions
  adapter: BaseAdapter
  logger: BasicLogger
  job: any | null
  maxAttempts: number
  deleteFailedJobs: boolean

  constructor(options: Options) {
    this.options = { ...DEFAULTS, ...options }

    // validate that everything we need is available
    if (!this.options.adapter) {
      throw new AdapterRequiredError()
    }
    if (!this.options.job) {
      throw new JobRequiredError()
    }

    this.adapter = this.options.adapter
    this.logger = this.options.logger
    this.job = this.options.job
    this.maxAttempts = this.options.maxAttempts
    this.deleteFailedJobs = this.options.deleteFailedJobs
  }

  async perform() {
    this.logger.info(this.job, `Started job ${this.job.id}`)
    const details = JSON.parse(this.job.handler)

    // TODO break these lines down into individual try/catch blocks?
    try {
      const jobModule = await loadJob(details.handler)
      await new jobModule[details.handler]().perform(...details.args)
      return this.adapter.success(this.job)
    } catch (e: any) {
      let error = e
      if (e.message.match(/is not a constructor/)) {
        error = new JobExportNotFoundError(details.handler)
      }
      this.logger.error(error.stack)
      return this.adapter.failure(this.job, error, {
        maxAttempts: this.maxAttempts,
        deleteFailedJobs: this.deleteFailedJobs,
      })
    }
  }
}
