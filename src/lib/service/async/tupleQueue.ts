import { InferFunctionOutput, InferObservableOutput, InferPromiseOutput, TupleList } from 'km-type';
import _ from 'lodash';
import { Observable, ReplaySubject, Subject } from 'rxjs';

type IActionType = 'promise' | 'observable';
type IActionResultStatus = 'success' | 'error';
type IAsync<OUTPUT> = Promise<OUTPUT> | Observable<OUTPUT>;
type IAction<OUTPUT> = (...args: unknown[]) => IAsync<OUTPUT>;
type IQueueEntry<NAME extends string = string, OUTPUT = any> = {
  name: NAME;
  action: IAction<OUTPUT>;
};
type IQueueEntryOptions<OUTPUTS extends IQueueEntry[]> = {
  outputs: TupleList<IQueueOutputShape<OUTPUTS[number]>[]>;
  liveDetails: ILiveDetails;
};
type ILiveDetails = {
  passed: number;
  fails: number;
  finished: number;
  total: number;
  firstItem: boolean;
  isStoped: boolean;
};

type IQueueOutputShape<ENTRY_ITEM extends IQueueEntry> = {
  config: {
    entryItem: ENTRY_ITEM;
    actionType: IActionType;
  };
  output:
    | InferObservableOutput<InferFunctionOutput<ENTRY_ITEM['action']>>
    | InferPromiseOutput<InferFunctionOutput<ENTRY_ITEM['action']>>;
  status: IActionResultStatus;
};

type IQueueOnFinish<OUTPUTS extends IQueueEntry[]> = IQueueEntryOptions<OUTPUTS>;

const makeAction = <
  ENTRY_ITEM extends IQueueEntry<NAME, OUTPUT>,
  OUTPUT_SHAPE extends IQueueOutputShape<ENTRY_ITEM>,
  NAME extends string = string,
  OUTPUT = any
>(
  item: ENTRY_ITEM,
  onReadyOutput: (output: OUTPUT_SHAPE) => void
) => {
  let action = item.action();

  let output = {} as OUTPUT_SHAPE;

  if (action instanceof Promise) {
    action
      .then((response) => {
        output = {
          config: {
            entryItem: item,
            actionType: 'promise',
          },
          // @ts-ignore
          output: response,
          status: 'success',
        } as OUTPUT_SHAPE;
        onReadyOutput(output);
      })
      .catch((error) => {
        output = {
          config: {
            entryItem: item,
            actionType: 'promise',
          },
          output: error,
          status: 'error',
        } as OUTPUT_SHAPE;
        onReadyOutput(output);
      });
  } else {
    action.subscribe({
      next: (response) => {
        output = {
          config: {
            actionType: 'observable',
            entryItem: item,
          },
          output: response,
          status: 'success',
        } as OUTPUT_SHAPE;
        onReadyOutput(output);
      },
      error: (error) => {
        output = {
          config: {
            actionType: 'observable',
            entryItem: item,
          },
          output: error,
          status: 'error',
        } as OUTPUT_SHAPE;
        onReadyOutput(output);
      },
    });
  }
};

const tupleQueue = <
  ITEMS extends ITEM[],
  ITEM extends IQueueEntry<NAME, OUTPUT>,
  OUTPUT extends any,
  NAME extends string
>(
  items: [...ITEMS],
  onRecord: ReplaySubject<IQueueOutputShape<ITEMS[number]>> = new ReplaySubject(items.length),
  onLive: Subject<IQueueOutputShape<ITEMS[number]>> = new Subject(),
  onFinish: ReplaySubject<IQueueOnFinish<[...ITEMS]>> = new ReplaySubject(1),
  onStop: ReplaySubject<IQueueOnFinish<[...ITEMS]>> = new ReplaySubject(1),
  liveDetails: ReplaySubject<ILiveDetails> = new ReplaySubject<ILiveDetails>(1),
  options: IQueueEntryOptions<[...ITEMS]> = {
    // @ts-ignore
    outputs: [],
    liveDetails: {
      fails: 0,
      passed: 0,
      finished: 0,
      total: items.length,
      firstItem: true,
      isStoped: true,
    },
  }
) => {
  if (options.liveDetails.firstItem == true) {
    options.liveDetails.isStoped = false;
    liveDetails.next(options.liveDetails);
    options.liveDetails.firstItem = false;
    liveDetails.next(options.liveDetails);
  }
  return {
    start: () => {
      if (options.liveDetails.isStoped == false) {
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
            // @ts-ignore
            options.outputs = [...options.outputs, v];

            onRecord.next(v);
            onLive.next(v);
            let newList = _.drop(items);
            // @ts-ignore
            tupleQueue(newList, onRecord, onLive, onFinish, onStop, liveDetails, options).start();
          });
        } else {
          options.liveDetails.isStoped = true;
          liveDetails.next(options.liveDetails);
          // @ts-ignore
          onStop.next(options);
          // @ts-ignore
          onFinish.next(options);
        }
      }
      return {
        onFinish,
      };
    },
    onRecord,
    onLive,
    onFinish,
    onStop,
    liveDetails,
    totalItems: items.length,
    stop: () => {
      options.liveDetails.isStoped = true;
      liveDetails.next(options.liveDetails);
      // @ts-ignore
      onStop.next(options);
      // @ts-ignore
      onFinish.next(options);
    },
  };
};

export default { tupleQueue };
