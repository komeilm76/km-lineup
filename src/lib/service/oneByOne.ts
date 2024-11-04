import { ref } from 'km-fresh';
import _ from 'lodash';
import { Observable, Subject } from 'rxjs';

type IUnValidEntry = (...args: unknown[]) => Promise<unknown> | Observable<unknown>;
type IValidEntry = { action: IUnValidEntry; index: number };
type IEntry = IUnValidEntry | IValidEntry;

type IResult = { status: 'success'; response: unknown } | { status: 'error'; response: unknown };
type IOutput = { index: number; result: IResult };

type IActionType = 'observable' | 'promise';

// @ts-ignore
const convertToValidEntry = (items: IEntry[]) => {
  return items.map((item, index) => {
    if (typeof item == 'function') {
      return { action: item, index } as IValidEntry;
    } else {
      return { action: item.action, index } as IValidEntry;
    }
  });
};

const innerOneByOne = <ENTRY extends IValidEntry>(
  items: ENTRY[],
  // @ts-ignore
  listener: Subject<IOutput> = new Subject<IOutput>(),
  // @ts-ignore
  outputs: ReturnType<typeof ref<IOutput[]>> = ref([])
) => {
  return {
    start: (
      // @ts-ignore
      finish?: (outputs: ReturnType<typeof ref<IOutput[]>>) => void
    ) => {
      let item = _.first(items);
      if (item !== undefined) {
        let action = item.action();
        if (action instanceof Promise) {
          action
            .then((response) => {
              let output: IOutput & { actionType: IActionType } = {
                index: item ? item.index : 0,
                actionType: 'promise',
                result: { response, status: 'success' },
              };
              outputs.setHard([...outputs.value, output]);
              listener.next(output);
              let newList = _.drop(items);
              innerOneByOne(newList, listener, outputs).start(() => finish && finish(outputs));
            })
            .catch((error) => {
              let output: IOutput & { actionType: IActionType } = {
                index: item ? item.index : 0,
                actionType: 'promise',

                result: { response: error, status: 'error' },
              };
              outputs.setHard([...outputs.value, output]);
              listener.next(output);
              let newList = _.drop(items);
              innerOneByOne(newList, listener, outputs).start(() => finish && finish(outputs));
            });
        }
        if (action instanceof Observable) {
          action.subscribe({
            next: (response) => {
              let output: IOutput & { actionType: IActionType } = {
                index: item ? item.index : 0,
                actionType: 'observable',
                result: { response, status: 'success' },
              };
              outputs.setHard([...outputs.value, output]);
              listener.next(output);
              let newList = _.drop(items);
              innerOneByOne(newList, listener, outputs).start(() => finish && finish(outputs));
            },
            error: (error) => {
              let output: IOutput & { actionType: IActionType } = {
                index: item ? item.index : 0,
                actionType: 'observable',
                result: { response: error, status: 'error' },
              };
              outputs.setHard([...outputs.value, output]);
              listener.next(output);
              let newList = _.drop(items);
              innerOneByOne(newList, listener, outputs).start(() => finish && finish(outputs));
            },
          });
        }
      } else {
        finish && finish(outputs);
      }
    },
    listener,
    outputs,
  };
};

const oneByOne = (items: IEntry[]) => {
  let validItems = convertToValidEntry(items);
  return innerOneByOne(validItems);
};

export default {
  oneByOne,
};
