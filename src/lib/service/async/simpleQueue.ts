import _ from 'lodash';
import { Observable, ReplaySubject, Subject } from 'rxjs';

type IActionType = 'promise' | 'observable';
type IActionResultStatus = 'success' | 'error';
type IAsync<OUTPUT> = Promise<OUTPUT> | Observable<OUTPUT>;
type IAction<OUTPUT> = (...args: unknown[]) => IAsync<OUTPUT>;
type IQueueEntry<OUTPUT = any> = IAction<OUTPUT>;
type IQueueEntryOptions<OUTPUT> = {
  outputs: IQueueOutputShape<OUTPUT>[];
  liveDetails: ILiveDetails;
  firstItem: boolean;
  isStoped: boolean;
};
type ILiveDetails = {
  passed: number;
  fails: number;
  finished: number;
  total: number;
};

type IQueueOutputShape<OUTPUT> = {
  result: OUTPUT;
  status: IActionResultStatus;
  actionType: IActionType;
};
type IQueueOnFinish<OUTPUT> = IQueueEntryOptions<OUTPUT>;

const makeAction = <OUTPUT>(
  item: IQueueEntry<OUTPUT>,
  onReadyOutput: (output: IQueueOutputShape<OUTPUT>) => void
) => {
  let action = item();
  let commonOutput = {} as Pick<IQueueOutputShape<OUTPUT>, 'actionType'>;
  let output = {} as IQueueOutputShape<OUTPUT>;
  if (action instanceof Promise) {
    commonOutput = {
      ...commonOutput,
      actionType: 'promise',
    };
    action
      .then((response) => {
        output = {
          ...commonOutput,
          result: response,
          status: 'success',
        };
        onReadyOutput(output);
      })
      .catch((error) => {
        output = {
          ...commonOutput,
          result: error,
          status: 'error',
        };
        onReadyOutput(output);
      });
  } else {
    commonOutput = {
      ...commonOutput,
      actionType: 'observable',
    };
    action.subscribe({
      next: (response) => {
        output = {
          ...commonOutput,
          result: response,
          status: 'success',
        };
        onReadyOutput(output);
      },
      error: (error) => {
        output = {
          ...commonOutput,
          result: error,
          status: 'error',
        };
        onReadyOutput(output);
      },
    });
  }
};

export const simpleQueue = <OUTPUT = any>(
  items: IQueueEntry<OUTPUT>[],
  onRecord: ReplaySubject<IQueueOutputShape<OUTPUT>> = new ReplaySubject(items.length),
  onLive: Subject<IQueueOutputShape<OUTPUT>> = new Subject(),
  onFinish: ReplaySubject<IQueueOnFinish<OUTPUT>> = new ReplaySubject(1),
  onStop: ReplaySubject<IQueueOnFinish<OUTPUT>> = new ReplaySubject(1),
  liveDetails: ReplaySubject<ILiveDetails> = new ReplaySubject<ILiveDetails>(1),
  options: IQueueEntryOptions<OUTPUT> = {
    outputs: [],
    liveDetails: { fails: 0, passed: 0, finished: 0, total: items.length },
    firstItem: true,
    isStoped: true,
  }
) => {
  if (options.firstItem == true) {
    options.isStoped = false;
    liveDetails.next(options.liveDetails);
    options.firstItem = false;
  }
  return {
    start: () => {
      let item = _.first(items);
      if (item !== undefined) {
        makeAction(item, (v) => {
          if (v.status == 'success') {
            options.liveDetails = {
              ...options.liveDetails,
              passed: options.liveDetails.passed + 1,
            };
            liveDetails.next(options.liveDetails);
          } else if (v.status == 'error') {
            options.liveDetails = {
              ...options.liveDetails,
              fails: options.liveDetails.fails + 1,
            };
            liveDetails.next(options.liveDetails);
          }
          options.liveDetails = {
            ...options.liveDetails,
            finished: options.liveDetails.finished + 1,
          };
          liveDetails.next(options.liveDetails);
          options.outputs = [...options.outputs, v];
          onRecord.next(v);
          onLive.next(v);
          let newList = _.drop(items);
          simpleQueue(newList, onRecord, onLive, onFinish, onStop, liveDetails, options).start();
        });
      } else {
        options.isStoped = true;
        onStop.next(options);
        onFinish.next(options);
      }
    },
    onRecord,
    onLive,
    onFinish,
    onStop,
    liveDetails,
    totalItems: items.length,
    stop: () => {
      options.isStoped = true;
      onStop.next(options);
      onFinish.next(options);
    },
  };
};

export default {
  simpleQueue,
};
