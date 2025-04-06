import { ref } from 'km-fresh';
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
      actionType: 'promise',
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
  onRecord: Subject<IQueueOutputShape<OUTPUT, NAME>> = new ReplaySubject(items.length),
  onLive: Subject<IQueueOutputShape<OUTPUT, NAME>> = new Subject(),
  outputs: ReturnType<typeof ref<IQueueOutputShape<OUTPUT, NAME>[]>> = ref([])
) => {
  return {
    start: (finish?: (v: ReturnType<typeof ref<IQueueOutputShape<OUTPUT, NAME>[]>>) => void) => {
      let sortedItems = orderActions(items);
      let item = _.first(sortedItems);
      if (item !== undefined) {
        makeAction(item, (v) => {
          outputs.setHard([...outputs.value, v]);
          onRecord.next(v);
          onLive.next(v);
          let newList = _.drop(sortedItems);
          advanceQueue(newList, onRecord, onLive, outputs).start(() => finish && finish(outputs));
        });
      } else {
        finish && finish(outputs);
      }
    },
    listener: onRecord,
    outputs,
  };
};

export default {
  advanceQueue,
};
