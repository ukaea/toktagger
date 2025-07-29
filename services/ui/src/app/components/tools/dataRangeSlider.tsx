"use client";
import { ViewParams } from '@/types';
import { RangeSlider, RangeValue } from '@adobe/react-spectrum'
import { useEffect, useState } from 'react';

type DataRangeSliderInfo = {
  name: string,
  data: Array<number>,
  onChange: (params: ViewParams) => void,
  getValueLabel: (param: RangeValue<number>) => string
}

export function DataRangeSlider({ name, data, onChange, getValueLabel}: DataRangeSliderInfo) {
    const [timeMinDefault, setTimeMinDefault] = useState(null);
    const [timeMaxDefault, setTimeMaxDefault] = useState(null);
    const [timeRange, setTimeRange] = useState({start: 0, end: 100}); 

    useEffect(() => {
        if (data && (timeMinDefault === null || timeMinDefault === null)) {
            const time = data;
            let tmin = Math.min(...time);
            let tmax = Math.max(...time); 
            setTimeMinDefault(tmin);
            setTimeMaxDefault(tmax);
            setTimeRange({start: tmin, end: tmax});
        }
    }, [data, timeMinDefault]);

    return (
        <div className='m-4'>
            <RangeSlider label={name} defaultValue={{ start: timeMinDefault, end: timeMaxDefault }} value={timeRange} onChange={setTimeRange} onChangeEnd={onChange} step={0.001} 
            minValue={timeMinDefault} maxValue={timeMaxDefault} getValueLabel={getValueLabel}/>
        </div>
    );
}