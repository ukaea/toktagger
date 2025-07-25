'use client'
import { Annotations, MultiVariateTimeSeriesData, TimeRegion, Zone, Category, Annotation } from "@/types"
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import 'react-contexify/ReactContexify.css';
import Plotly from "plotly.js-dist";

type ELMViewInfo = {
    data: MultiVariateTimeSeriesData, 
    annotations: Annotations, 
    setAnnotations: (annotations: Annotations) => void
};
export const ELMView = ({data, annotations, setAnnotations}: ELMViewInfo) => {

    var dataTrace = {
        name: 'Dalpha',
        x: data.values.dalpha.time,
        y: data.values.dalpha.values,
        mode: 'lines',
    };

    var ipTrace = {
        name: 'Ip',
        x: data.values.ip.time,
        y: data.values.ip.values,
        xaxis: "x2",
        yaxis: "y2",
        mode: 'lines',
    };

    var powerNBITrace = {
        name: 'NBI Power',
        x: data.values.power_nbi.time,
        y: data.values.power_nbi.values,
        xaxis: "x3",
        yaxis: "y3",
        mode: 'lines',
    };

    var densityGradientTrace = {
        name: 'Density Gradient',
        x: data.values.density_gradient.time,
        y: data.values.density_gradient.values,
        xaxis: "x4",
        yaxis: "y4",
        mode: 'lines',
    };

    var t_e_coreTrace = {
        name: 'Te Core',
        x: data.values.t_e_core.time,
        y: data.values.t_e_core.values,
        xaxis: "x5",
        yaxis: "y5",
        mode: 'lines',
    };

    var sxrTrace = {
        name: 'Soft X-Ray',
        x: data.values.sxr.time,
        y: data.values.sxr.values,
        xaxis: "x6",
        yaxis: "y6",
        mode: 'lines',
    };

    const plotData: Plotly.Data[] = [dataTrace, ipTrace, densityGradientTrace, powerNBITrace, t_e_coreTrace, sxrTrace];


    var plotLayout = {
        uirevision: 'true',
        grid: {rows: 6, columns: 1, pattern: 'independent'},
        dragmode: false,  // Disable default drag behavior
        width: 1100,
        height: 800,
        xaxis: {
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
            },
        yaxis: {
            title: {
                text: 'Dalpha [V]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        xaxis2: {
            matches:'x',
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        yaxis2: {
            title: {
                text: 'Ip [kA]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        xaxis3: {
            matches:'x',
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        yaxis3: {
            title: {
                text: 'NBI Power [W]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        xaxis4: {
            matches:'x',
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        yaxis4: {
            title: {
                text: 'Density Gradient []',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        xaxis5: {
            matches:'x',
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        yaxis5: {
            title: {
                text: 'T_e Core [eV]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        xaxis6: {
            matches:'x',
            title: {
                text: 'Time [s]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
        yaxis6: {
            title: {
                text: 'SXR [arb]',
                font: {
                family: 'Courier New, monospace',
                size: 12,
                color: '#7f7f7f'
                }
            },
        },
    };

    
    const zoneCategories: Category[] = [
        { name: "Peak", color: 'rgb(233, 170, 98)' },
        { name: "Outlier", color: 'rgb(233, 170, 250)' },
        { name: "Jump", color: 'rgb(1, 250, 1)' },
        { name: "Change Point", color: 'rgb(133, 170, 250)' },
    ]

    const convertRegionToZone = (item: TimeRegion) => {
        const category = zoneCategories.find(x => x.name === item.label);
        return {x0: item.time_min, x1: item.time_max, category: category, created_by: item.created_by} as Zone;
    };
    annotations = annotations.filter(item => item.type === 'time_region') as TimeRegion[];
    const zones = annotations.map(convertRegionToZone);

    const updateAnnotations = (newZones: Array<Zone>) => {
        const zones = newZones.map(item => ({
                type: 'time_region',
                created_by: item.created_by,
                time_min: item.x0,
                time_max: item.x1,
                label: item.category.name
        }));

        setAnnotations(zones);
    }

    return (
        <div className="flex space-y-3">
            <div className="flex-1 text-center items-center">
                <ContextMenuProvider menuId="elm-menu">
                    <ZoneProvider categories={zoneCategories} initialData={zones} onModifyZone={updateAnnotations}>
                        <TimeSeries plotId="ELMs" plotConfig={{data: plotData, layout: plotLayout}}>
                            <Zones />
                        </TimeSeries>
                    </ZoneProvider>
                </ContextMenuProvider>
            </div>
        </div>
    )
}