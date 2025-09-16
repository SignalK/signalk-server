import { HistoryProvider, isHistoryProvider, ValuesRequest, ValuesRequestQueryParams } from "@signalk/server-api/history";
import { IRouter } from "express";
import { Temporal } from '@js-temporal/polyfill';
import { Context } from "@signalk/server-api";

export class HistoryApi {
  private provider?: HistoryProvider;
  constructor(private app: IRouter) { }

  registerHistoryProvider(provider: HistoryProvider) {
    if (!isHistoryProvider(provider)) {
      throw new Error("Invalid history provider");
    }
    this.provider = provider;
  }

  private validateHistoryQuery(query: Record<string, unknown>): ValuesRequest {
    const errors: string[] = [];

    const paths = query.paths as string
    if (!paths) {
      errors.push('paths parameter is required and must be a string');
    }

    const fromStr = query.from as string | undefined    
    let from: Temporal.Instant | undefined;
    if (fromStr) {
      try {
        from = Temporal.Instant.from(fromStr);
      } catch (error) {
        errors.push(`from parameter must be a valid ISO 8601 timestamp: ${error instanceof Error ? error.message : 'Invalid format'}`);
      }
    }

    const durationStr = query.duration as string | undefined
    const durationNum = getMaybeNumber(query.duration);
    let duration: Temporal.Duration | undefined;
    if (durationStr) {
      try {
        duration = Temporal.Duration.from(durationStr);
      } catch (error) {
        errors.push(`duration parameter must be a valid ISO 8601 duration string: ${error instanceof Error ? error.message : 'Invalid format'}`);
      }
    } else if (durationNum !== undefined) {
      duration = Temporal.Duration.from({ milliseconds: durationNum });
    }

    if (!from && !duration) {
      errors.push('Either from or duration parameter is required at minimum');
    }

    const toStr = query.to as string | undefined
    let to: Temporal.Instant | undefined;
    if (toStr) {
      try {
        to = Temporal.Instant.from(toStr);
      } catch (error) {
        errors.push(`to parameter must be a valid ISO 8601 timestamp: ${error instanceof Error ? error.message : 'Invalid format'}`);
      }
    }

    if (from && to && duration) {
      errors.push('Cannot specify all of from, to, and duration together; choose either from+to or from+duration or to+duration');
    }

    if (from && to && Temporal.Instant.compare(from, to) >= 0) {
      errors.push('from parameter must be before to parameter');
    }

    const context = query.context as Context | undefined
    const resolution = getMaybeNumber(query.resolution);

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return {
      from,
      to,
      duration,
      context,
      resolution
    } as ValuesRequest
  }

  start() {
    this.app.get(
      "/signalk/v2/history/values",
      async (req, res) => {
        try {
          if (!this.provider) {
            return res.status(501).json({ error: 'No history provider configured' });
          }

          const query = this.validateHistoryQuery(req.query);
          const history = await this.provider.getValues(query);
          res.json(history);
        } catch (error) {
          res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
        }
      }
    )
  }
}

const getMaybeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'number') return value;
  return undefined;
};
