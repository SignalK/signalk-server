import { Bus } from './types';
export interface PropertyValue {
    timestamp: number;
    setter: string;
    name: string;
    value: any;
}
export declare type PropertyValuesCallback = (propValuesHistory: PropertyValue[]) => void;
export default class PropertyValues {
    streams: {
        [key: string]: {
            bus: Bus;
            stream: any;
        };
    };
    onPropertyValues(propName: string, cb: PropertyValuesCallback): () => void;
    emitPropertyValue(pv: PropertyValue): void;
    private getStreamTuple;
}
