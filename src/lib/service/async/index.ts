import advanceQueue from './advanceQueue';
import simpleQueue from './simpleQueue';
import tupleQueue from './tupleQueue';
export default {
  ...simpleQueue,
  ...advanceQueue,
  ...tupleQueue,
};
