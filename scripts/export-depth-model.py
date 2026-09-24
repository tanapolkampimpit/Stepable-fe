"""Regenerate the bundled Depth Anything V2 outdoor metric depth ONNX model.

Build-time only: pip install torch transformers onnx onnxruntime
Run from the project root: python scripts/export-depth-model.py
"""

from pathlib import Path
from tempfile import TemporaryDirectory

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForDepthEstimation

SOURCE = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf"
DESTINATION = Path("assets/models/depth-anything-v2-metric-outdoor-small.int8.onnx")
INPUT_SIZE = 280


class DepthOutput(torch.nn.Module):
    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return self.model(pixel_values=image).predicted_depth


def main() -> None:
    model = DepthOutput(AutoModelForDepthEstimation.from_pretrained(SOURCE).eval()).eval()
    with TemporaryDirectory() as directory:
        float_model = Path(directory) / "depth-float.onnx"
        with torch.inference_mode():
            torch.onnx.export(
                model,
                torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE),
                str(float_model),
                input_names=["image"],
                output_names=["depth"],
                opset_version=17,
                dynamo=False,
                do_constant_folding=True,
            )
        quantize_dynamic(str(float_model), str(DESTINATION), weight_type=QuantType.QUInt8)
    print(f"Wrote {DESTINATION} ({DESTINATION.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
