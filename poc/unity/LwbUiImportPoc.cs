// LWB UI Editor — T0.4 Unity POC（Unity 2022 LTS）
// 使用方式：将本文件放入 Unity 工程的 Assets/ 下任意 **Editor** 文件夹（例如 Assets/Editor/LwbUiImportPoc.cs），
// 等待编译后菜单 **Tools → LWB UI POC**。
#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace LwbUi.Poc
{
    public static class LwbUiImportPoc
    {
        private const string PrefabPath = "Assets/UI/Poc/LwbUiPoc.prefab";
        private const string PocPngPath = "Assets/UI/Poc/lwb_poc_generated.png";

        [MenuItem("Tools/LWB UI POC")]
        public static void Run()
        {
            EnsureFolder("Assets/UI");
            EnsureFolder("Assets/UI/Poc");

            WriteGeneratedPng();
            AssetDatabase.ImportAsset(PocPngPath, ImportAssetOptions.ForceUpdate);
            var ti = AssetImporter.GetAtPath(PocPngPath) as TextureImporter;
            if (ti != null)
            {
                ti.textureType = TextureImporterType.Sprite;
                ti.spriteImportMode = SpriteImportMode.Single;
                ti.SaveAndReimport();
            }

            var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(PocPngPath);

            var root = new GameObject("LwbUiPoc_Root", typeof(RectTransform));
            var canvas = root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            root.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            root.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1920f, 1080f);
            root.AddComponent<GraphicRaycaster>();

            // Image — pivot center，anchoredPosition (100, -200)
            var goImage = new GameObject("Image", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            goImage.transform.SetParent(root.transform, false);
            var rtImage = goImage.GetComponent<RectTransform>();
            rtImage.anchorMin = rtImage.anchorMax = new Vector2(0.5f, 0.5f);
            rtImage.pivot = new Vector2(0.5f, 0.5f);
            rtImage.sizeDelta = new Vector2(120f, 120f);
            rtImage.anchoredPosition = new Vector2(100f, -200f);
            var img = goImage.GetComponent<Image>();
            if (sprite != null)
            {
                img.sprite = sprite;
            }
            img.color = Color.white;

            // TextMeshPro
            var goText = new GameObject("TextMeshPro", typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
            goText.transform.SetParent(root.transform, false);
            var rtText = goText.GetComponent<RectTransform>();
            rtText.anchorMin = rtText.anchorMax = new Vector2(0.5f, 0.5f);
            rtText.pivot = new Vector2(0.5f, 0.5f);
            rtText.sizeDelta = new Vector2(400f, 80f);
            rtText.anchoredPosition = new Vector2(0f, 120f);
            var tmp = goText.GetComponent<TextMeshProUGUI>();
            tmp.text = "LWB UI POC 中文";
            tmp.fontSize = 28f;
            tmp.alignment = TextAlignmentOptions.Center;
            TryAssignChineseCapableFont(tmp);

            // Button + 子节点 TextMeshPro（DefaultControls 默认 legacy Text，此处替换为 TMP）
            var goBtn = DefaultControls.CreateButton(GetResources());
            goBtn.name = "Button";
            goBtn.transform.SetParent(root.transform, false);
            var rtBtn = goBtn.GetComponent<RectTransform>();
            rtBtn.anchorMin = rtBtn.anchorMax = new Vector2(0.5f, 0.5f);
            rtBtn.sizeDelta = new Vector2(200f, 48f);
            rtBtn.anchoredPosition = new Vector2(0f, -80f);
            foreach (var lt in goBtn.GetComponentsInChildren<UnityEngine.UI.Text>(true))
            {
                Object.DestroyImmediate(lt.gameObject);
            }
            var tBtnLabel = new GameObject("Text", typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
            tBtnLabel.transform.SetParent(goBtn.transform, false);
            var rtBL = tBtnLabel.GetComponent<RectTransform>();
            rtBL.anchorMin = Vector2.zero;
            rtBL.anchorMax = Vector2.one;
            rtBL.offsetMin = rtBL.offsetMax = Vector2.zero;
            var btnTmp = tBtnLabel.GetComponent<TextMeshProUGUI>();
            btnTmp.text = "Button";
            btnTmp.alignment = TextAlignmentOptions.Center;
            TryAssignChineseCapableFont(btnTmp);

            // Slider（标准 UGUI 层级）
            var goSlider = DefaultControls.CreateSlider(GetResources());
            goSlider.name = "Slider";
            goSlider.transform.SetParent(root.transform, false);
            var rtSlider = goSlider.GetComponent<RectTransform>();
            rtSlider.anchorMin = rtSlider.anchorMax = new Vector2(0.5f, 0.5f);
            rtSlider.sizeDelta = new Vector2(300f, 24f);
            rtSlider.anchoredPosition = new Vector2(0f, -200f);

            // Toggle
            var goToggle = DefaultControls.CreateToggle(GetResources());
            goToggle.name = "Toggle";
            goToggle.transform.SetParent(root.transform, false);
            var rtToggle = goToggle.GetComponent<RectTransform>();
            rtToggle.anchorMin = rtToggle.anchorMax = new Vector2(0.5f, 0.5f);
            rtToggle.sizeDelta = new Vector2(160f, 32f);
            rtToggle.anchoredPosition = new Vector2(0f, -280f);

            // InputField（Legacy UI）
            var goInput = DefaultControls.CreateInputField(GetResources());
            goInput.name = "InputField";
            goInput.transform.SetParent(root.transform, false);
            var rtInput = goInput.GetComponent<RectTransform>();
            rtInput.anchorMin = rtInput.anchorMax = new Vector2(0.5f, 0.5f);
            rtInput.sizeDelta = new Vector2(320f, 40f);
            rtInput.anchoredPosition = new Vector2(0f, -360f);

            PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            Object.DestroyImmediate(root);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<Object>(PrefabPath));
            EditorUtility.DisplayDialog("LWB UI POC", $"已生成 Prefab：\n{PrefabPath}", "OK");
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path))
            {
                return;
            }
            var parts = path.Split('/');
            var cur = parts[0];
            for (var i = 1; i < parts.Length; i++)
            {
                var next = $"{cur}/{parts[i]}";
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(cur, parts[i]);
                }
                cur = next;
            }
        }

        private static void WriteGeneratedPng()
        {
            var tex = new Texture2D(8, 8, TextureFormat.RGBA32, false);
            var c = new Color32(80, 160, 255, 255);
            var arr = tex.GetPixels32();
            for (var i = 0; i < arr.Length; i++)
            {
                arr[i] = c;
            }
            tex.SetPixels32(arr);
            tex.Apply();
            var png = tex.EncodeToPNG();
            Object.DestroyImmediate(tex);
            File.WriteAllBytes(PocPngPath, png);
        }

        private static DefaultControls.Resources GetResources()
        {
            return new DefaultControls.Resources
            {
                standard = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd"),
                background = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Background.psd"),
                inputField = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/InputFieldBackground.psd"),
                knob = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd"),
                checkmark = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Checkmark.psd"),
                dropdown = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/DropdownArrow.psd"),
                mask = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UIMask.psd"),
            };
        }

        /// <summary>
        /// 若工程已导入中文字体（TMP Font Asset），尽量绑定；否则保持默认，需按 README 手动指定。
        /// </summary>
        private static void TryAssignChineseCapableFont(TextMeshProUGUI text)
        {
            var guids = AssetDatabase.FindAssets("t:TMP_FontAsset");
            foreach (var guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (path.Contains("Chinese") || path.Contains("CJK") || path.Contains("Noto"))
                {
                    var font = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(path);
                    if (font != null)
                    {
                        text.font = font;
                        return;
                    }
                }
            }
        }
    }
}
#endif
