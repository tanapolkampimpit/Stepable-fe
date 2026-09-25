# Depth Anything V2 metric outdoor small

`depth-anything-v2-metric-outdoor-small.int8.onnx` is a fixed 280 × 280 ONNX export of the [official outdoor metric small checkpoint](https://huggingface.co/depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf). It is dynamically quantized to reduce the bundled model from about 99 MB to 27 MB. The upstream project is [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2). The Small model is Apache 2.0 licensed; see [the accompanying license](depth-anything-v2.LICENSE).

Regenerate it with `python scripts/export-depth-model.py` after installing `torch`, `transformers`, `onnx`, and `onnxruntime` in a build environment. The mobile application only needs the ONNX file and its existing ONNX Runtime dependency.

The checkpoint was trained for outdoor metric depth using synthetic Virtual KITTI scenes. Its estimates have **not** been calibrated or validated for a phone carried by a pedestrian. Distance values in the app are marked as approximate. They must not be used as a sole basis for stepping around traffic or obstacles. The existing segmentation model also groups road and sidewalk into one class, so a visually clearer side is not necessarily a safe walking route.
