'use client'
import { ZoneProvider } from "@/app/components/providers/zone-provider"
import { ContextMenuProvider } from "@/app/components/providers/context-menu-provider"
import { TimeSeries } from "@/app/components/plots/time-series"
import { Zones } from "@/app/components/tools/zones"
import 'react-contexify/ReactContexify.css';
import Plotly from "plotly.js-dist";

type GraphProps = {
    time: Array<number>,
    values: Record<string, Array<number>>
}

export const ElmGraph = ({data} : GraphProps) => {
    var dataTrace = {
        name: 'Dalpha',
        x: data.time,
        y: data.values.dalpha,
        mode: 'lines',
    };

    var ipTrace = {
        name: 'Ip',
        x: data.time,
        y: data.values.ip,
        xaxis: "x2",
        yaxis: "y2",
        mode: 'lines',
    };

    var powerNBITrace = {
        name: 'NBI Power',
        x: data.time,
        y: data.values.power_nbi,
        xaxis: "x3",
        yaxis: "y3",
        mode: 'lines',
    };

    var densityGradientTrace = {
        name: 'Density Gradient',
        x: data.time,
        y: data.values.density_gradient,
        xaxis: "x4",
        yaxis: "y4",
        mode: 'lines',
    };

    var t_e_coreTrace = {
        name: 'Te Core',
        x: data.time,
        y: data.values.t_e_core,
        xaxis: "x5",
        yaxis: "y5",
        mode: 'lines',
    };

    const plotData: Plotly.Data[] = [dataTrace, ipTrace, densityGradientTrace, powerNBITrace, t_e_coreTrace];


    var plotLayout = {
        uirevision: 'true',
        grid: {rows: 5, columns: 1, pattern: 'independent'},
        dragmode: false,  // Disable default drag behavior
        width: 1500,
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
    };

    
    const zoneCategories: Category[] = [
            { name: "ELM", color: 'rgb(233, 170, 98)' },
        ]

    const initialZones: Zone[] = [
        { x0: 0.05, x1: 0.1, category: zoneCategories[0] },
        { x0: 0.15, x1: 0.2, category: zoneCategories[1] },
    ]


    return (
        <div className="flex flex-col items-center space-y-3">
            <header className="p-6">
                <h1 className="text-4xl font-bold text-center text-gray-900">
                    ELM Tagging Demo
                </h1>
            </header>
            <div className="text-center">
                <ContextMenuProvider menuId="elm-menu">
                    <ZoneProvider categories={zoneCategories} initialData={[]}>
                        <TimeSeries plotId="ELMs" plotConfig={{data: plotData, layout: plotLayout}}>
                            <Zones />
                        </TimeSeries>
                    </ZoneProvider>
                </ContextMenuProvider>
            </div>
        </div>
    )
}