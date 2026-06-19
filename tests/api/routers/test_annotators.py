import pytest

from toktagger.api.schemas.annotators import AnnotatorTypes


@pytest.mark.asyncio
async def test_annotators_invalid_type(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 10, "distance": 5},
        "data_params": {"name": "identity"},
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_2']}/annotator/wrong_type",
        json=params,
    )
    # Should throw a validation error since annotator of this type doesnt exist
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_annotators(api_client, setup_db):
    params = {
        # prominence=500 reliably isolates the 4 ELM spikes (value=1000) from
        # the background signal (max~100) without internal StandardScaler normalisation.
        "annotator_params": {"signal_name": "Ip", "prominence": 500, "distance": 1},
        "data_params": {"name": "identity"},
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )

    returned_annotations = response.json()
    # Check it found 4 ELMs since we added 4 spikes to the data at 20, 40, 60, 80
    assert len(returned_annotations) == 4
    for annotation in returned_annotations:
        assert annotation["label"] == "Unknown"
        assert annotation["created_by"] == AnnotatorTypes.PEAK_DETECTION
        assert "time_min" in annotation
        assert "time_max" in annotation


@pytest.mark.asyncio
async def test_annotators_not_supported_for_project(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 10, "distance": 5},
        "data_params": {"name": "identity"},
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_3']}/samples/{setup_db['sample_id_3']}/annotator/peak_detection",
        json=params,
    )
    # Should throw a 409 conflict error since Disruption project does not support Find Peaks annotator
    assert response.status_code == 409
    assert "The selected annotator cannot be used" in response.json().get("detail")


# --- Preprocessing integration tests ---


@pytest.mark.asyncio
async def test_annotator_with_smoothing_preprocessing(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 1, "distance": 1},
        "data_params": {"name": "identity"},
        "preprocessing": {
            "steps": [
                {
                    "type": "smoothing",
                    "signal_name": "Ip",
                    "method": "gaussian",
                    "sigma": 2.0,
                }
            ]
        },
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )
    assert response.status_code == 200
    annotations = response.json()
    assert isinstance(annotations, list)
    for ann in annotations:
        assert "time_min" in ann
        assert "time_max" in ann


@pytest.mark.asyncio
async def test_annotator_with_normalisation_preprocessing(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 0.1, "distance": 1},
        "data_params": {"name": "identity"},
        "preprocessing": {
            "steps": [
                {"type": "normalisation", "signal_name": "Ip", "method": "zscore"}
            ]
        },
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_annotator_with_background_subtraction_preprocessing(
    api_client, setup_db
):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 0.01, "distance": 1},
        "data_params": {"name": "identity"},
        "preprocessing": {
            "steps": [
                {
                    "type": "background_subtraction",
                    "signal_name": "Ip",
                    "window_size": 500,
                }
            ]
        },
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_annotator_with_multiple_preprocessing_steps(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 0.1, "distance": 1},
        "data_params": {"name": "identity"},
        "preprocessing": {
            "steps": [
                {
                    "type": "smoothing",
                    "signal_name": "Ip",
                    "method": "gaussian",
                    "sigma": 1.0,
                },
                {"type": "normalisation", "signal_name": "Ip", "method": "zscore"},
            ]
        },
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_annotator_preprocessing_invalid_step_type_rejected(api_client, setup_db):
    params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 1, "distance": 1},
        "data_params": {"name": "identity"},
        "preprocessing": {"steps": [{"type": "invalid_type", "signal_name": "Ip"}]},
    }
    response = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=params,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_annotator_empty_preprocessing_behaves_as_no_preprocessing(
    api_client, setup_db
):
    base_params = {
        "annotator_params": {"signal_name": "Ip", "prominence": 1, "distance": 1},
        "data_params": {"name": "identity"},
    }
    with_empty = {**base_params, "preprocessing": {"steps": []}}

    r_none = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=base_params,
    )
    r_empty = await api_client.post(
        f"/projects/{setup_db['project_id_2']}/samples/{setup_db['sample_id_4']}/annotator/peak_detection",
        json=with_empty,
    )

    assert r_none.status_code == 200
    assert r_empty.status_code == 200
    assert len(r_none.json()) == len(r_empty.json())
