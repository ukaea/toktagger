import pathlib

import h5py
import numpy

DEFUSE_TIME = numpy.linspace(0.0, 1.0, 101, dtype=numpy.float32)
DEFUSE_SIGNAL_OFFSETS = {"IPLA_v1": 0.0, "ZMAG_v1": 1.0, "ZMAG_v2": 2.0}


def write_defuse_file(file_path: pathlib.Path) -> pathlib.Path:
    """Write a small HDF5 file with the same SIG/objDIS layout as DEFUSE output."""
    with h5py.File(file_path, "w") as h5_file:
        h5_file.attrs["mastu_shot"] = 12345
        signals = h5_file.create_group("SIG")
        for group_name, offset in DEFUSE_SIGNAL_OFFSETS.items():
            group = signals.create_group(group_name)
            group["time"] = DEFUSE_TIME
            group["signal"] = DEFUSE_TIME + offset
        signals.create_group("Termination_v1")["DMV"] = numpy.zeros((15, 1))
        signals.create_group("metadata_table")["version"] = numpy.ones((1, 1))
        h5_file.create_group("objDIS/IPLA")["signal"] = numpy.zeros((1, 10))
    return file_path
