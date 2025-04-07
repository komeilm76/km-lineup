import _ from 'lodash';
import { Observable, ReplaySubject, Subject } from 'rxjs';
type IActionType = 'promise' | 'observable';
type IActionResultStatus = 'success' | 'error';
type IAsync<OUTPUT> = Promise<OUTPUT> | Observable<OUTPUT>;
type IAction<OUTPUT> = (...args: unknown[]) => IAsync<OUTPUT>;
type IQueueEntry<NAME extends string = string, OUTPUT = any> = {
  order?: number;
  name: NAME;
  action: IAction<OUTPUT>;
};
type IQueueEntryOptions<OUTPUT, NAME extends string> = {
  outputs: IQueueOutputShape<OUTPUT, NAME>[];
  liveDetails: ILiveDetails;
  firstItem: boolean;
};
type ILiveDetails = {
  passed: number;
  fails: number;
  finished: number;
  total: number;
};

type IQueueOutputShape<OUTPUT, NAME extends string = string> = {
  result: OUTPUT;
  status: IActionResultStatus;
  name: NAME;
  actionType: IActionType;
  order: number;
};

const makeAction = <OUTPUT, NAME extends string = string>(
  item: IQueueEntry<NAME, OUTPUT>,
  onReadyOutput: (output: IQueueOutputShape<OUTPUT, NAME>) => void
) => {
  let action = item.action();
  let order = item.order as number;
  let commonOutput = {
    name: item.name,
    order,
  } as Pick<IQueueOutputShape<OUTPUT, NAME>, 'name' | 'actionType' | 'order'>;
  let output = {} as IQueueOutputShape<OUTPUT, NAME>;
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

export const orderActions = <NAME extends string = string, OUTPUT = any>(
  items: IQueueEntry<NAME, OUTPUT>[]
) => {
  let withOrderKey = _.filter(items, (item) => item.order !== undefined);
  let withoutOrderKey = _.filter(items, (item) => item.order === undefined);

  // Sort items with order key by their order
  withOrderKey = _.sortBy(withOrderKey, 'order');

  // Generate dynamic order for items without order key
  const maxOrder = _.isEmpty(withOrderKey) ? 0 : _.maxBy(withOrderKey, 'order')!.order!;
  _.forEach(withoutOrderKey, (item, index) => {
    item.order = maxOrder + index + 1;
  });

  // Combine both arrays and sort by order
  return _.sortBy([...withOrderKey, ...withoutOrderKey], 'order');
};

export const advanceQueue = <NAME extends string = string, OUTPUT = any>(
  items: IQueueEntry<NAME, OUTPUT>[],
  onRecord: ReplaySubject<IQueueOutputShape<OUTPUT, NAME>> = new ReplaySubject(items.length),
  onLive: Subject<IQueueOutputShape<OUTPUT, NAME>> = new Subject(),
  onFinish: ReplaySubject<IQueueOutputShape<OUTPUT, NAME>[]> = new ReplaySubject(1),
  liveDetails: ReplaySubject<ILiveDetails> = new ReplaySubject<ILiveDetails>(1),
  options: IQueueEntryOptions<OUTPUT, NAME> = {
    outputs: [],
    liveDetails: { fails: 0, passed: 0, finished: 0, total: items.length },
    firstItem: true,
  }
) => {
  if (options.firstItem == true) {
    liveDetails.next(options.liveDetails);
    options.firstItem = false;
  }
  return {
    start: () => {
      let sortedItems = orderActions(items);
      let item = _.first(sortedItems);
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
          let newList = _.drop(sortedItems);
          advanceQueue(newList, onRecord, onLive, onFinish, liveDetails, options).start();
        });
      } else {
        onFinish.next(options.outputs);
      }
    },
    onRecord,
    onLive,
    onFinish,
    liveDetails,
    total: items.length,
  };
};

export default {
  advanceQueue,
};
