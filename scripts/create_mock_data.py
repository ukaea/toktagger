from pathlib import Path
from typing import Optional
import requests
import numpy
import random
import json
from setup import create_project, create_local_samples

def create_mock_data(file_path: str, num_samples: int):
    data = {}
    for shot_id in range(1, num_samples+1):
        t_ramp_start = random.randint(20, 40)
        t_ramp_end = random.randint(140, 240)
        t_disrupt_start = random.randint(400, 500)
        
        spike_time = random.randint(1, 5)
        down_time = random.randint(10, 20)

        low = numpy.random.uniform(0, 2, t_ramp_start)

        ramping = random.uniform(0.1, 1)*numpy.arange(t_ramp_end - t_ramp_start) + numpy.random.uniform(0, 2, t_ramp_end - t_ramp_start)

        flat = ramping[-1] + numpy.random.uniform(0, 5, t_disrupt_start - t_ramp_end)

        spike = flat[-1] + 20*numpy.arange(spike_time) + numpy.random.uniform(0, 2, spike_time)

        down = numpy.linspace(spike[-1], 0, down_time) + numpy.random.uniform(0, 2, down_time)

        low_2 = numpy.random.uniform(0, 2, 600 - (t_disrupt_start + spike_time + down_time))

        current = numpy.concatenate((low, ramping, flat, spike, down, low_2))
        time = 0.02*numpy.arange(len(current))
        
        data[shot_id] = {
            "data": {
                "ip": {
                    "values": current.tolist(),
                    "times": time.tolist()   
                },
            },
            "annotations": {
                "ramp_up_start": 0.02*t_ramp_start,
                "ramp_up_end": 0.02*t_ramp_end,
                "disruption": 0.02*t_disrupt_start
            }
        }
        
    with open(str(Path(__file__).parents[1]) + file_path, "w") as file:
        json.dump(data, file)
        
    return data


def main():
    num_samples = 200
    file_path = "/data/test/mock_data.json"
    data = create_mock_data(file_path, num_samples)
    project_id = create_project("New Mock Disruption Project", "disruption", "json")
    # Make annotations to add at same time as sample
    annotations = {shot_id: [{"validated": True, "label": "disruption", "time": item["annotations"]["disruption"]}] for shot_id, item in data.items()}
    create_local_samples(project_id, list(range(1, num_samples+1)), base_path=file_path, file_type="json", annotations=annotations, signals=["ip"])

    non_annotated = create_mock_data("/data/test/non_annotated_data.json", num_samples)
    create_local_samples(project_id, list(range(1, num_samples+1)), base_path=file_path, file_type="json", signals=["ip"])
if __name__ == "__main__":
    main()
