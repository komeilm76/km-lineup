import { ref } from 'km-fresh';
import _ from 'lodash';
import { Observable, ReplaySubject, Subject } from 'rxjs';
type IActionType = 'promise' | 'observable';
type IActionResultStatus = 'success' | 'error';
type IAsync<OUTPUT> = Promise<OUTPUT> | Observable<OUTPUT>;
type IAction<OUTPUT> = (...args: unknown[]) => IAsync<OUTPUT>;
type IQueueEntry<OUTPUT = any> = IAction<OUTPUT>;

type IQueueOutputShape<OUTPUT> = {
  result: OUTPUT;
  status: IActionResultStatus;
  actionType: IActionType;
};

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

export const simpleQueue = <OUTPUT = any>(
  items: IQueueEntry<OUTPUT>[],
  onRecord: Subject<IQueueOutputShape<OUTPUT>> = new ReplaySubject(items.length),
  onLive: Subject<IQueueOutputShape<OUTPUT>> = new Subject(),
  outputs: ReturnType<typeof ref<IQueueOutputShape<OUTPUT>[]>> = ref([])
) => {
  return {
    start: (finish?: (v: ReturnType<typeof ref<IQueueOutputShape<OUTPUT>[]>>) => void) => {
      let item = _.first(items);
      if (item !== undefined) {
        makeAction(item, (v) => {
          outputs.setHard([...outputs.value, v]);
          onRecord.next(v);
          onLive.next(v);
          let newList = _.drop(items);
          simpleQueue(newList, onRecord, onLive, outputs).start(() => finish && finish(outputs));
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
  simpleQueue,
};
