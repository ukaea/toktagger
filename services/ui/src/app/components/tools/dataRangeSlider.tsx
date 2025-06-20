"use client";
import { RangeSlider} from '@adobe/react-spectrum'
import { useEffect, useState } from 'react';

export function DataRangeSlider({ name, data, onChange, getValueLabel}) {
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
    }, [data]);

    return (
        <div className='m-4'>
            <RangeSlider label={name} defaultValue={{ start: timeMinDefault, end: timeMaxDefault }} value={timeRange} onChange={setTimeRange} onChangeEnd={onChange} step={0.001} 
            minValue={timeMinDefault} maxValue={timeMaxDefault} getValueLabel={getValueLabel}/>
        </div>
    );
}