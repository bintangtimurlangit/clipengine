"""Settings router validation for pipeline bounds."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from clipengine_api.routers.settings import _validate_pipeline_effective


def test_validate_pipeline_accepts_valid() -> None:
    _validate_pipeline_effective(
        {
            "longformMinS": 180.0,
            "longformMaxS": 360.0,
            "shortformMinS": 27.0,
            "shortformMaxS": 80.0,
            "snapDurationSlackS": 3.0,
            "maxUploadBytes": 5 * 1024**3,
            "produceLongform": True,
            "produceShortform": True,
        }
    )


def test_validate_pipeline_rejects_longform_order() -> None:
    with pytest.raises(HTTPException) as exc:
        _validate_pipeline_effective(
            {
                "longformMinS": 400.0,
                "longformMaxS": 360.0,
                "shortformMinS": 27.0,
                "shortformMaxS": 80.0,
                "snapDurationSlackS": 3.0,
                "maxUploadBytes": 5 * 1024**3,
                "produceLongform": True,
                "produceShortform": True,
            }
        )
    assert exc.value.status_code == 400


def test_validate_pipeline_rejects_upload_too_small() -> None:
    with pytest.raises(HTTPException) as exc:
        _validate_pipeline_effective(
            {
                "longformMinS": 180.0,
                "longformMaxS": 360.0,
                "shortformMinS": 27.0,
                "shortformMaxS": 80.0,
                "snapDurationSlackS": 3.0,
                "maxUploadBytes": 512 * 1024,
                "produceLongform": True,
                "produceShortform": True,
            }
        )
    assert exc.value.status_code == 400


def test_validate_pipeline_rejects_both_kinds_disabled() -> None:
    with pytest.raises(HTTPException) as exc:
        _validate_pipeline_effective(
            {
                "longformMinS": 180.0,
                "longformMaxS": 360.0,
                "shortformMinS": 27.0,
                "shortformMaxS": 80.0,
                "snapDurationSlackS": 3.0,
                "maxUploadBytes": 5 * 1024**3,
                "produceLongform": False,
                "produceShortform": False,
            }
        )
    assert exc.value.status_code == 400
