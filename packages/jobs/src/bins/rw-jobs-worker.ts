#!/usr/bin/env node

// The process that actually starts an instance of Worker to process jobs.
import * as process from 'node:process'

import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'

import { loadAdapter, loadLogger } from '../core/loaders'
import { Worker } from '../core/Worker'
import type { BasicLogger } from '../types'

const TITLE_PREFIX = `rw-jobs-worker`

const parseArgs = (argv: string[]) => {
  return yargs(hideBin(argv))
    .usage(
      'Starts a single RedwoodJob worker to process background jobs\n\nUsage: $0 [options]',
    )
    .option('i', {
      alias: 'id',
      type: 'number',
      description: 'The worker ID',
      default: 0,
    })
    .option('q', {
      alias: 'queue',
      type: 'string',
      description: 'The named queue to work on',
    })
    .option('o', {
      alias: 'workoff',
      type: 'boolean',
      default: false,
      description: 'Work off all jobs in the queue and exit',
    })
    .option('c', {
      alias: 'clear',
      type: 'boolean',
      default: false,
      description: 'Remove all jobs in the queue and exit',
    })
    .help().argv
}

const setProcessTitle = ({ id, queue }: { id: string; queue: string }) => {
  // set the process title
  let title = TITLE_PREFIX
  if (queue) {
    title += `.${queue}.${id}`
  } else {
    title += `.${id}`
  }

  // @ts-expect-error - TS will claim this is read-only
  process.title = title
}

const setupSignals = ({
  worker,
  logger,
}: {
  worker: Worker
  logger: BasicLogger
}) => {
  // if the parent itself receives a ctrl-c it'll pass that to the workers.
  // workers will exit gracefully by setting `forever` to `false` which will tell
  // it not to pick up a new job when done with the current one
  process.on('SIGINT', () => {
    logger.warn(
      `[${process.title}] SIGINT received at ${new Date().toISOString()}, finishing work...`,
    )
    worker.forever = false
  })

  // if the parent itself receives a ctrl-c more than once it'll send SIGTERM
  // instead in which case we exit immediately no matter what state the worker is
  // in
  process.on('SIGTERM', () => {
    logger.info(
      `[${process.title}] SIGTERM received at ${new Date().toISOString()}, exiting now!`,
    )
    process.exit(0)
  })
}

const main = async () => {
  // TODO TOBBE For some reason the `parseArgs` type reports that it is only returning the single letter option flags as keys in this object (i, q, c, o), but it does return the alias names as well (id, queue, clear, workoff) I'd rather use the full alias names here as it's much easier to understand what the values are for.
  // @ts-ignore
  const { id, queue, clear, workoff } = parseArgs(process.argv)
  setProcessTitle({ id, queue })

  const logger = await loadLogger()
  let adapter

  try {
    adapter = await loadAdapter()
  } catch (e) {
    logger.error(e)
    process.exit(1)
  }

  logger.info(
    `[${process.title}] Starting work at ${new Date().toISOString()}...`,
  )

  const worker = new Worker({
    adapter,
    processName: process.title,
    logger,
    queue,
    workoff,
    clear,
  })

  worker.run().then(() => {
    logger.info(`[${process.title}] Worker finished, shutting down.`)
    process.exit(0)
  })

  setupSignals({ worker, logger })
}

main()
