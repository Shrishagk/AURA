# ============================================================
# SOCIAL MEDIA TREND ANOMALY FINDER
# Enhanced Kaggle Notebook — Production-Grade Pipeline
# ============================================================
# Dataset columns: timestamp, platform, post_id, user_id, text,
#   hashtags, likes, comments, shares, views, sentiment_score,
#   anomaly_label, anomaly_type, topic_category, engagement_score,
#   rolling_mean, rolling_std, z_score
# Platforms : Instagram, Twitter, Reddit, YouTube, TikTok
# Topics    : sports, finance, entertainment, health, politics,
#             gaming, tech, science, food, fashion
# ============================================================


# ─────────────────────────────────────────────────────────────
# CELL 1 │ Imports & Global Config
# ─────────────────────────────────────────────────────────────
import os
import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
from collections import Counter
try:
    from IPython.display import display
except ImportError:
    display = print   # fallback for non-Jupyter environments

warnings.filterwarnings("ignore")
pd.set_option("display.max_columns", 50)
pd.set_option("display.float_format", "{:.4f}".format)

# ── Aesthetic palette ──────────────────────────────────────
PALETTE = {
    "spike"  : "#E74C3C",
    "drop"   : "#3498DB",
    "normal" : "#2ECC71",
    "accent" : "#9B59B6",
    "bg"     : "#F8F9FA",
}
sns.set_theme(style="whitegrid", font_scale=1.1)
plt.rcParams.update({"figure.facecolor": PALETTE["bg"], "axes.facecolor": PALETTE["bg"]})

# ── Kaggle-portable path helper ────────────────────────────
def find_dataset(filename: str) -> str:
    """
    Resolves the CSV path whether running locally or on Kaggle.
    No hard-coded paths.
    """
    search_roots = [
        ".",
        "/kaggle/input",
        os.path.join(os.getcwd(), "input"),
    ]
    for root in search_roots:
        for dirpath, _, files in os.walk(root):
            if filename in files:
                path = os.path.join(dirpath, filename)
                print(f"✅  Found dataset at: {path}")
                return path
    raise FileNotFoundError(
        f"'{filename}' not found under any search root: {search_roots}.\n"
        "Please add the dataset to your Kaggle notebook input or place it "
        "in the working directory."
    )

DATASET_FILE = r"C:\Users\shris\OneDrive\Desktop\Codeclash\Datasets\social_media_dataset.csv"


# ─────────────────────────────────────────────────────────────
# CELL 2 │ Load & Validate Data
# ─────────────────────────────────────────────────────────────
def load_and_validate(filepath: str) -> pd.DataFrame:
    """Loads the CSV, enforces types, and runs basic sanity checks."""
    print("📂  Loading dataset …")
    df = pd.read_csv(filepath, parse_dates=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    # ── Type coercion ──────────────────────────────────────
    int_cols = ["likes", "comments", "shares", "views"]
    for c in int_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)
    df["engagement_score"] = pd.to_numeric(df["engagement_score"], errors="coerce")
    df["sentiment_score"]  = pd.to_numeric(df["sentiment_score"],  errors="coerce")

    # ── Drop dataset-provided rolling cols (we recompute them) ──
    stale = ["rolling_mean", "rolling_std", "z_score"]
    df.drop(columns=[c for c in stale if c in df.columns], inplace=True)

    # ── Validation report ──────────────────────────────────
    print(f"\n{'─'*50}")
    print(f"  Rows       : {len(df):,}")
    print(f"  Columns    : {df.shape[1]}")
    print(f"  Time range : {df['timestamp'].min()} → {df['timestamp'].max()}")
    print(f"  Platforms  : {sorted(df['platform'].unique().tolist())}")
    print(f"  Topics     : {sorted(df['topic_category'].unique().tolist())}")
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    if not missing.empty:
        print(f"\n  ⚠️  Missing values:\n{missing.to_string()}")
    print(f"{'─'*50}\n")

    # ── Ground-truth label check ───────────────────────────
    if "anomaly_label" in df.columns:
        dist = df["anomaly_label"].value_counts().to_dict()
        print(f"  Ground-truth labels → {dist}")
        anomaly_pct = dist.get(1, 0) / len(df) * 100
        print(f"  Labelled anomaly rate: {anomaly_pct:.2f}%\n")

    return df


# ─────────────────────────────────────────────────────────────
# CELL 3 │ Feature Engineering
# ─────────────────────────────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Creates a rich feature set around engagement behaviour,
    temporal signals, hashtag metadata, and text complexity.
    """
    print("⚙️  Engineering features …")
    df = df.copy()

    # ── 3.1  Temporal features ─────────────────────────────
    df["hour"]        = df["timestamp"].dt.hour
    df["minute"]      = df["timestamp"].dt.minute
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    df["week_of_year"]= df["timestamp"].dt.isocalendar().week.astype(int)
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)

    # Cyclic encoding so hour 23 is close to hour 0
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["dow_sin"]  = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["dow_cos"]  = np.cos(2 * np.pi * df["day_of_week"] / 7)

    # ── 3.2  Rolling statistics (multi-window) ─────────────
    score = df["engagement_score"]
    for w in [5, 15, 30, 60]:
        rm = score.rolling(w, min_periods=1).mean()
        rs = score.rolling(w, min_periods=1).std().fillna(0)
        df[f"rm_{w}"]  = rm
        df[f"rs_{w}"]  = rs
        df[f"z_{w}"]   = (score - rm) / (rs + 1e-6)

    # ── 3.3  Lag / momentum / velocity ────────────────────
    for lag in [1, 2, 3, 6]:
        df[f"lag_{lag}"] = score.shift(lag).fillna(0)

    df["momentum"]     = score - df["lag_1"]
    df["acceleration"] = df["momentum"] - (df["lag_1"] - df["lag_2"])
    df["velocity"]     = score.diff().fillna(0)
    df["growth_rate"]  = df["momentum"] / (df["lag_1"].abs() + 1)

    # ── 3.4  Relative spike / drop ─────────────────────────
    df["relative_spike"] = score / (df["lag_1"] + 1)

    # ── 3.5  Hashtag features ──────────────────────────────
    df["tag_list"]        = df["hashtags"].apply(lambda x: [t.strip() for t in str(x).split(",")])
    df["hashtags_count"]  = df["tag_list"].apply(len)

    all_tags: Counter = Counter()
    for tags in df["tag_list"]:
        all_tags.update(tags)
    df["hashtag_popularity"] = df["tag_list"].apply(lambda tags: sum(all_tags[t] for t in tags))

    # ── 3.6  Text complexity ───────────────────────────────
    df["text_length"] = df["text"].apply(lambda x: len(str(x)))
    df["word_count"]  = df["text"].apply(lambda x: len(str(x).split()))
    df["avg_word_len"]= df["text_length"] / (df["word_count"] + 1)

    # ── 3.7  Sentiment dynamics ────────────────────────────
    df["sentiment_shift"]    = df["sentiment_score"] - df["sentiment_score"].shift(1).fillna(0)
    df["sentiment_volatility"]= df["sentiment_score"].rolling(10, min_periods=1).std().fillna(0)

    # ── 3.8  Platform weights (engagement amplification) ───
    platform_map = {
        "Twitter"  : 1.0,
        "Instagram": 1.2,
        "Reddit"   : 0.8,
        "YouTube"  : 1.5,
        "TikTok"   : 1.4,
    }
    df["platform_weight"]   = df["platform"].map(platform_map).fillna(1.0)
    df["weighted_engagement"]= score * df["platform_weight"]

    # ── 3.9  Topic-relative strength ──────────────────────
    topic_mean             = df.groupby("topic_category")["engagement_score"].transform("mean")
    topic_std              = df.groupby("topic_category")["engagement_score"].transform("std").fillna(1)
    df["topic_strength"]   = score / (topic_mean + 1)
    df["topic_z"]          = (score - topic_mean) / (topic_std + 1e-6)

    # ── 3.10 Platform deviation ────────────────────────────
    platform_mean           = df.groupby("platform")["engagement_score"].transform("mean")
    df["platform_deviation"]= score / (platform_mean + 1)

    # ── 3.11 Composite anomaly strength ───────────────────
    df["anomaly_strength"] = (
        df["z_15"].abs()
        * (1 + df["growth_rate"].abs())
        * (1 + df["hashtags_count"])
        * (1 + df["sentiment_shift"].abs())
    )

    # ── 3.12 Volatility (regime awareness) ────────────────
    df["volatility"] = df["rs_15"]

    print(f"  ✅  Feature engineering complete — {df.shape[1]} columns total.\n")
    return df


# ─────────────────────────────────────────────────────────────
# CELL 4 │ Preprocessing & Scaling
# ─────────────────────────────────────────────────────────────
from sklearn.preprocessing import RobustScaler   # robust to outliers

FEATURE_COLS = [
    "engagement_score", "weighted_engagement",
    "relative_spike", "platform_deviation",
    "momentum", "acceleration", "velocity", "growth_rate",
    "lag_1", "lag_2",
    "hashtags_count", "hashtag_popularity",
    "text_length", "word_count",
    "sentiment_score", "sentiment_shift", "sentiment_volatility",
    "topic_strength", "topic_z",
    "volatility", "z_15", "z_30",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    "is_weekend", "platform_weight",
    "anomaly_strength",
]

DROP_COLS = [
    "post_id", "user_id", "tag_list", "text",
]

def preprocess(df: pd.DataFrame) -> tuple[pd.DataFrame, RobustScaler]:
    """Drops unused columns, fills NaNs, scales features."""
    print("🔧  Preprocessing …")
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns])
    df = df.fillna(0)

    existing_features = [c for c in FEATURE_COLS if c in df.columns]
    scaler = RobustScaler()
    df[existing_features] = scaler.fit_transform(df[existing_features])

    print(f"  ✅  Preprocessing done — {df.shape[1]} columns kept.\n")
    return df, scaler


# ─────────────────────────────────────────────────────────────
# CELL 5 │ Anomaly Detection  (Isolation Forest + ECOD ensemble)
# ─────────────────────────────────────────────────────────────
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor

def detect_anomalies(
    df: pd.DataFrame,
    contamination: float = 0.10,
    n_estimators: int = 200,
    random_state: int = 42,
) -> pd.DataFrame:
    """
    Two-model ensemble:
      • IsolationForest — tree-based, global anomalies
      • LocalOutlierFactor — density-based, local clusters
    Final prediction = majority vote of the two models.
    """
    print("🔍  Running anomaly detection ensemble …")
    existing_features = [c for c in FEATURE_COLS if c in df.columns]
    X = df[existing_features].values

    # ── Model 1: Isolation Forest ──────────────────────────
    iso = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        max_features=0.8,          # sub-sampling for diversity
        bootstrap=True,
        random_state=random_state,
        n_jobs=-1,
    )
    iso_pred  = iso.fit_predict(X)            # -1 = anomaly
    iso_score = iso.decision_function(X)      # lower = more anomalous

    df["iso_pred"]  = (iso_pred == -1).astype(int)
    df["iso_score"] = iso_score               # keep raw scores

    # ── Model 2: Local Outlier Factor ─────────────────────
    lof = LocalOutlierFactor(
        n_neighbors=20,
        contamination=contamination,
        n_jobs=-1,
    )
    lof_pred           = lof.fit_predict(X)
    df["lof_pred"]     = (lof_pred == -1).astype(int)
    df["lof_score"]    = -lof.negative_outlier_factor_   # higher = more anomalous

    # ── Ensemble: majority vote (agree on anomaly → flag) ─
    df["anomaly_votes"] = df["iso_pred"] + df["lof_pred"]
    df["anomaly_pred"]  = (df["anomaly_votes"] >= 1).astype(int)  # either model

    # ── Confidence score: normalised combined signal ───────
    iso_norm  = (iso_score.max() - iso_score) / (iso_score.max() - iso_score.min() + 1e-9)
    lof_norm  = (df["lof_score"] - df["lof_score"].min()) / (df["lof_score"].max() - df["lof_score"].min() + 1e-9)
    df["confidence_score"] = (iso_norm + lof_norm.values) / 2  # 0 = normal, 1 = very anomalous

    n_detected = df["anomaly_pred"].sum()
    print(f"  Anomalies detected : {n_detected:,}  ({n_detected/len(df)*100:.2f}%)")

    # ── Optional: compare with ground truth if available ──
    if "anomaly_label" in df.columns:
        from sklearn.metrics import classification_report, roc_auc_score
        y_true = df["anomaly_label"].values
        y_pred = df["anomaly_pred"].values
        print("\n  📊  Classification Report vs Ground Truth:\n")
        print(classification_report(y_true, y_pred, target_names=["Normal", "Anomaly"]))
        try:
            auc = roc_auc_score(y_true, df["confidence_score"].values)
            print(f"  ROC-AUC: {auc:.4f}")
        except Exception:
            pass

    print()
    return df


# ─────────────────────────────────────────────────────────────
# CELL 6 │ Anomaly Typing (Spike vs Drop)
# ─────────────────────────────────────────────────────────────
def classify_anomaly_type(row) -> str:
    """Rule-based typing of each detected anomaly."""
    if row["anomaly_pred"] == 0:
        return "none"
    z = row.get("z_15", 0)
    growth = row.get("growth_rate", 0)
    momentum = row.get("momentum", 0)
    if z > 1.5 or growth > 0.5 or momentum > 0:
        return "spike"
    if z < -1.5 or growth < -0.5 or momentum < 0:
        return "drop"
    return "spike"   # default to spike if borderline positive

def explain_anomaly(row) -> str:
    """Human-readable reason string for each anomaly row."""
    if row["anomaly_pred"] == 0:
        return ""
    reasons = []
    if row.get("relative_spike", 0) > 1.5:
        reasons.append("sudden engagement spike")
    if row.get("relative_spike", 0) < -1.5:
        reasons.append("sudden engagement drop")
    if row.get("hashtags_count", 0) > 1.5:
        reasons.append("high hashtag usage")
    if abs(row.get("sentiment_shift", 0)) > 0.5:
        reasons.append("abrupt sentiment change")
    if row.get("momentum", 0) > 1.5:
        reasons.append("rapid positive momentum")
    if row.get("momentum", 0) < -1.5:
        reasons.append("rapid negative momentum")
    if row.get("topic_z", 0) > 2:
        reasons.append("far above topic average")
    if row.get("volatility", 0) > 1.5:
        reasons.append("high volatility window")
    if not reasons:
        reasons.append("statistical outlier")
    return " | ".join(reasons)

def annotate_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    print("🏷️   Annotating anomaly types and reasons …")
    df = df.copy()
    df["detected_type"]   = df.apply(classify_anomaly_type, axis=1)
    df["anomaly_reason"]  = df.apply(explain_anomaly, axis=1)
    type_dist = df[df["anomaly_pred"]==1]["detected_type"].value_counts().to_dict()
    print(f"  Type distribution → {type_dist}\n")
    return df


# ─────────────────────────────────────────────────────────────
# CELL 7 │ Event Clustering (grouping consecutive anomalies)
# ─────────────────────────────────────────────────────────────
def build_event_summary(df: pd.DataFrame) -> pd.DataFrame:
    """
    Groups consecutive anomalous rows into named 'events' and
    produces a rich summary table per event.
    """
    print("🗂️   Building event summary …")

    df = df.copy()
    df["event_start"] = (df["anomaly_pred"] == 1) & (df["anomaly_pred"].shift(1, fill_value=0) != 1)
    df["event_id"]    = df["event_start"].cumsum().astype(float)
    df.loc[df["anomaly_pred"] == 0, "event_id"] = np.nan

    def top_hashtags(series) -> list:
        tags = []
        for row in series:
            tags.extend(str(row).split(","))
        return [t[0] for t in Counter(tags).most_common(5)]

    anomalous = df[df["anomaly_pred"] == 1]

    agg = anomalous.groupby("event_id").agg(
        start_time            = ("timestamp",        "min"),
        end_time              = ("timestamp",        "max"),
        post_count            = ("timestamp",        "count"),
        engagement_mean       = ("engagement_score", "mean"),
        engagement_max        = ("engagement_score", "max"),
        engagement_min        = ("engagement_score", "min"),
        confidence_mean       = ("confidence_score", "mean"),
        sentiment_mean        = ("sentiment_score",  "mean"),
        hashtags_count_mean   = ("hashtags_count",   "mean"),
        topic_strength_mean   = ("topic_strength",   "mean"),
        platform_weight_mean  = ("platform_weight",  "mean"),
        dominant_platform     = ("platform",         lambda x: x.value_counts().idxmax()),
        dominant_topic        = ("topic_category",   lambda x: x.value_counts().idxmax()),
        dominant_type         = ("detected_type",    lambda x: x.value_counts().idxmax()),
        top_reasons           = ("anomaly_reason",   lambda x: " | ".join(set(" | ".join(x).split(" | ")))),
    ).reset_index()

    tag_df = anomalous.groupby("event_id")["hashtags"].apply(top_hashtags).reset_index()
    tag_df.columns = ["event_id", "top_hashtags"]
    agg = agg.merge(tag_df, on="event_id", how="left")

    agg["duration_seconds"] = (agg["end_time"] - agg["start_time"]).dt.total_seconds()

    def generate_label(row) -> str:
        parts = []
        if row["dominant_type"] == "spike":
            parts.append("🔺 Viral Spike")
        elif row["dominant_type"] == "drop":
            parts.append("🔻 Engagement Drop")
        else:
            parts.append("⚠️  Anomaly")
        parts.append(f"[{row['dominant_topic'].title()}]")
        parts.append(f"on {row['dominant_platform']}")
        return " ".join(parts)

    agg["event_label"] = agg.apply(generate_label, axis=1)
    agg["event_intensity"] = (
        agg["engagement_max"].abs()
        * agg["hashtags_count_mean"].abs()
        * (agg["sentiment_mean"].abs() + 0.1)
        * agg["confidence_mean"]
    )
    agg = agg.sort_values("event_intensity", ascending=False).reset_index(drop=True)

    print(f"  Total events detected : {len(agg)}")
    print(f"  Top-5 events by intensity:\n")
    display(agg[["event_label","dominant_platform","dominant_topic","post_count",
                 "engagement_max","confidence_mean","event_intensity",
                 "start_time","end_time"]].head(5))
    print()
    return df, agg


# ─────────────────────────────────────────────────────────────
# CELL 8 │ Visualisations
# ─────────────────────────────────────────────────────────────
def plot_engagement_timeline(df: pd.DataFrame, sample_n: int = 5000):
    """Engagement score over time with anomalies highlighted."""
    print("📈  Plotting engagement timeline …")
    sample = df.sample(min(sample_n, len(df)), random_state=42).sort_values("timestamp")

    fig, ax = plt.subplots(figsize=(18, 5))
    ax.plot(sample["timestamp"], sample["engagement_score"],
            color="#555", alpha=0.5, linewidth=0.7, label="Engagement")

    spikes = sample[sample["detected_type"] == "spike"]
    drops  = sample[sample["detected_type"] == "drop"]
    ax.scatter(spikes["timestamp"], spikes["engagement_score"],
               color=PALETTE["spike"], s=20, zorder=5, label="Spike", alpha=0.8)
    ax.scatter(drops["timestamp"],  drops["engagement_score"],
               color=PALETTE["drop"],  s=20, zorder=5, label="Drop",  alpha=0.8)

    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
    plt.xticks(rotation=30, ha="right")
    ax.set_title("Engagement Timeline with Anomaly Highlights", fontsize=15, fontweight="bold")
    ax.set_xlabel("Date"); ax.set_ylabel("Engagement Score (scaled)")
    ax.legend(loc="upper right")
    plt.tight_layout()
    plt.savefig("engagement_timeline.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: engagement_timeline.png\n")


def plot_anomaly_distribution(df: pd.DataFrame):
    """Platform × anomaly-type heatmap + topic bar."""
    print("📊  Plotting anomaly distribution …")
    fig, axes = plt.subplots(1, 2, figsize=(16, 5))

    # ── Heatmap: platform vs anomaly type ──
    pivot = (df[df["anomaly_pred"]==1]
             .groupby(["platform","detected_type"])
             .size()
             .unstack(fill_value=0))
    sns.heatmap(pivot, ax=axes[0], annot=True, fmt="d",
                cmap="YlOrRd", linewidths=0.5)
    axes[0].set_title("Anomaly Count: Platform × Type", fontweight="bold")

    # ── Bar: topic category ──
    topic_counts = (df[df["anomaly_pred"]==1]
                    .groupby(["topic_category","detected_type"])
                    .size()
                    .unstack(fill_value=0)
                    .sort_values("spike", ascending=True))
    topic_counts.plot(kind="barh", ax=axes[1],
                      color=[PALETTE["spike"], PALETTE["drop"]],
                      edgecolor="white")
    axes[1].set_title("Anomalies by Topic Category", fontweight="bold")
    axes[1].set_xlabel("Count")

    plt.tight_layout()
    plt.savefig("anomaly_distribution.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: anomaly_distribution.png\n")


def plot_hourly_heatmap(df: pd.DataFrame):
    """Day-of-week × hour heatmap of anomaly density."""
    print("🕐  Plotting hourly anomaly heatmap …")
    anom = df[df["anomaly_pred"] == 1].copy()
    pivot = (anom.groupby(["day_of_week","hour"])
                 .size()
                 .unstack(fill_value=0))
    pivot.index = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

    fig, ax = plt.subplots(figsize=(16, 4))
    sns.heatmap(pivot, ax=ax, cmap="Reds", linewidths=0.3,
                cbar_kws={"label": "Anomaly Count"})
    ax.set_title("Anomaly Density by Day-of-Week × Hour", fontweight="bold")
    ax.set_xlabel("Hour of Day"); ax.set_ylabel("Day of Week")
    plt.tight_layout()
    plt.savefig("hourly_heatmap.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: hourly_heatmap.png\n")


def plot_sentiment_vs_engagement(df: pd.DataFrame, sample_n: int = 8000):
    """Scatter: sentiment vs engagement coloured by anomaly type."""
    print("🎭  Plotting sentiment vs engagement …")
    sample = df.sample(min(sample_n, len(df)), random_state=42)

    fig, ax = plt.subplots(figsize=(10, 6))
    color_map = {"none": PALETTE["normal"], "spike": PALETTE["spike"], "drop": PALETTE["drop"]}
    for atype, group in sample.groupby("detected_type"):
        ax.scatter(group["sentiment_score"], group["engagement_score"],
                   c=color_map.get(atype, "#888"), alpha=0.4, s=8,
                   label=atype.title())
    ax.set_xlabel("Sentiment Score (scaled)")
    ax.set_ylabel("Engagement Score (scaled)")
    ax.set_title("Sentiment vs Engagement by Anomaly Type", fontweight="bold")
    ax.legend(markerscale=2)
    plt.tight_layout()
    plt.savefig("sentiment_vs_engagement.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: sentiment_vs_engagement.png\n")


def plot_top_events(event_df: pd.DataFrame, top_n: int = 15):
    """Horizontal bar of top events by intensity."""
    print("🏆  Plotting top events …")
    top = event_df.head(top_n).sort_values("event_intensity")
    colors = [PALETTE["spike"] if t=="spike" else PALETTE["drop"]
              for t in top["dominant_type"]]

    fig, ax = plt.subplots(figsize=(12, max(5, top_n * 0.55)))
    bars = ax.barh(top["event_label"], top["event_intensity"], color=colors, edgecolor="white")
    ax.bar_label(bars, fmt="{:.2f}", padding=3, fontsize=9)
    ax.set_xlabel("Event Intensity Score")
    ax.set_title(f"Top {top_n} Anomaly Events by Intensity", fontweight="bold")
    plt.tight_layout()
    plt.savefig("top_events.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: top_events.png\n")


def plot_feature_importance(df: pd.DataFrame):
    """
    Uses a trained RandomForestClassifier to rank the features
    that matter most for predicting anomalies.
    """
    from sklearn.ensemble import RandomForestClassifier
    print("🌲  Computing feature importance …")
    existing_features = [c for c in FEATURE_COLS if c in df.columns]
    X = df[existing_features].fillna(0)
    y = df["anomaly_pred"]

    rf = RandomForestClassifier(n_estimators=100, max_depth=8,
                                 n_jobs=-1, random_state=42)
    rf.fit(X, y)
    imp = pd.Series(rf.feature_importances_, index=existing_features).sort_values(ascending=True)
    top20 = imp.tail(20)

    fig, ax = plt.subplots(figsize=(10, 7))
    top20.plot(kind="barh", ax=ax, color=PALETTE["accent"], edgecolor="white")
    ax.set_title("Top 20 Features for Anomaly Prediction (Random Forest)", fontweight="bold")
    ax.set_xlabel("Importance")
    plt.tight_layout()
    plt.savefig("feature_importance.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: feature_importance.png\n")
    return imp


def plot_rolling_anomaly_rate(df: pd.DataFrame):
    """Daily rolling anomaly rate to spot temporal clusters."""
    print("📉  Plotting rolling anomaly rate …")
    daily = (df.set_index("timestamp")
               .resample("D")["anomaly_pred"]
               .agg(["sum","count"]))
    daily["rate"] = daily["sum"] / (daily["count"] + 1e-9)

    fig, ax = plt.subplots(figsize=(16, 4))
    ax.fill_between(daily.index, daily["rate"], alpha=0.3, color=PALETTE["spike"])
    ax.plot(daily.index, daily["rate"], color=PALETTE["spike"], linewidth=1.5)
    ax.axhline(daily["rate"].mean(), linestyle="--", color="#888", label="Mean rate")
    ax.set_title("Daily Anomaly Rate Over Time", fontweight="bold")
    ax.set_ylabel("Anomaly Rate"); ax.set_xlabel("Date")
    ax.legend()
    plt.tight_layout()
    plt.savefig("rolling_anomaly_rate.png", dpi=150, bbox_inches="tight")
    plt.show()
    print("  Saved: rolling_anomaly_rate.png\n")


# ─────────────────────────────────────────────────────────────
# CELL 9 │ Real-time Streaming Simulator
# ─────────────────────────────────────────────────────────────
import time

def stream_realtime(df: pd.DataFrame, n_rows: int = 100, sleep: float = 0.03):
    """
    Simulates a real-time data stream — prints a structured alert
    whenever an anomaly is detected.
    """
    print("📡  Starting real-time stream simulation …\n")
    prev_event = -1
    count = 0

    for i in range(min(n_rows, len(df))):
        row = df.iloc[i]
        count += 1

        # Always print a lightweight heartbeat every 10 rows
        if count % 10 == 0:
            print(f"  [{count:>4}] {row['timestamp']}  "
                  f"Engagement: {row['engagement_score']:+.3f}  "
                  f"Platform: {row['platform']:<10}")

        if row["anomaly_pred"] == 1:
            eid = row.get("event_id", np.nan)
            is_new_event = (not pd.isna(eid)) and (eid != prev_event)
            prefix = "🔥 NEW EVENT" if is_new_event else "🚨 ANOMALY"
            atype_icon = "🔺" if row["detected_type"] == "spike" else "🔻"
            print(f"\n  {'='*60}")
            print(f"  {prefix}  {atype_icon}  [{row['detected_type'].upper()}]")
            print(f"  Time      : {row['timestamp']}")
            print(f"  Platform  : {row['platform']}  |  Topic: {row['topic_category']}")
            print(f"  Engagement: {row['engagement_score']:+.4f}")
            print(f"  Confidence: {row['confidence_score']:.3f}")
            print(f"  Reasons   : {row['anomaly_reason']}")
            print(f"  {'='*60}\n")
            if not pd.isna(eid):
                prev_event = eid

        time.sleep(sleep)

    print(f"\n  ✅  Stream simulation complete — {count} rows processed.")


# ─────────────────────────────────────────────────────────────
# CELL 10 │ Export Results
# ─────────────────────────────────────────────────────────────
def export_results(df: pd.DataFrame, event_df: pd.DataFrame):
    """Saves annotated dataset and event summary to CSV."""
    print("💾  Exporting results …")

    output_dir = "/kaggle/working" if os.path.exists("/kaggle/working") else "."

    anomaly_path = os.path.join(output_dir, "anomaly_results.csv")
    event_path   = os.path.join(output_dir, "event_summary.csv")

    export_cols = [
        "timestamp", "platform", "topic_category",
        "engagement_score", "sentiment_score",
        "anomaly_pred", "detected_type", "anomaly_reason",
        "confidence_score", "anomaly_strength",
        "hashtags", "event_id",
    ]
    export_cols = [c for c in export_cols if c in df.columns]
    df[export_cols].to_csv(anomaly_path, index=False)

    event_df.to_csv(event_path, index=False)

    print(f"  ✅  Anomaly results  → {anomaly_path}")
    print(f"  ✅  Event summary    → {event_path}\n")


# ─────────────────────────────────────────────────────────────
# CELL 11 │ Summary Report
# ─────────────────────────────────────────────────────────────
def print_summary_report(df: pd.DataFrame, event_df: pd.DataFrame):
    """Prints a comprehensive terminal report."""
    total        = len(df)
    n_anom       = df["anomaly_pred"].sum()
    n_spikes     = (df["detected_type"] == "spike").sum()
    n_drops      = (df["detected_type"] == "drop").sum()
    n_events     = len(event_df)

    print("\n" + "═"*60)
    print("  📋  SOCIAL MEDIA TREND ANOMALY FINDER — SUMMARY REPORT")
    print("═"*60)
    print(f"  Total records      : {total:,}")
    print(f"  Anomalies detected : {n_anom:,}  ({n_anom/total*100:.2f}%)")
    print(f"    ├─ Spikes        : {n_spikes:,}")
    print(f"    └─ Drops         : {n_drops:,}")
    print(f"  Distinct events    : {n_events:,}")

    print(f"\n  Top 3 most anomalous platforms:")
    plat = df[df["anomaly_pred"]==1]["platform"].value_counts().head(3)
    for p, c in plat.items():
        print(f"    {p:<15}: {c:,}")

    print(f"\n  Top 3 most anomalous topics:")
    topic = df[df["anomaly_pred"]==1]["topic_category"].value_counts().head(3)
    for t, c in topic.items():
        print(f"    {t:<15}: {c:,}")

    print(f"\n  Peak anomaly hour (UTC): {df[df['anomaly_pred']==1]['hour'].mode().iloc[0]}:00")

    if "anomaly_label" in df.columns:
        from sklearn.metrics import f1_score, precision_score, recall_score
        y_true = df["anomaly_label"]
        y_pred = df["anomaly_pred"]
        print(f"\n  Evaluation vs Ground Truth:")
        print(f"    Precision : {precision_score(y_true, y_pred):.4f}")
        print(f"    Recall    : {recall_score(y_true, y_pred):.4f}")
        print(f"    F1 Score  : {f1_score(y_true, y_pred):.4f}")

    print("\n  Top 5 events:")
    display(event_df[["event_label","dominant_platform","post_count",
                       "event_intensity","start_time"]].head(5))
    print("═"*60 + "\n")


# ─────────────────────────────────────────────────────────────
# CELL 12 │ Main Pipeline Orchestrator
# ─────────────────────────────────────────────────────────────
def run_pipeline(
    dataset_filename: str = "social_media_dataset.csv",
    contamination: float  = 0.10,
    stream_rows: int      = 80,
    run_stream_sim: bool  = True,
):
    """
    End-to-end pipeline:
      Load → Feature Engineering → Preprocess → Detect
      → Annotate → Events → Visualise → Export → Report
    """
    print("🚀  Social Media Trend Anomaly Finder — Pipeline Start\n")

    # 1. Load
    filepath = find_dataset(dataset_filename)
    df = load_and_validate(filepath)

    # 2. Feature Engineering
    df = engineer_features(df)

    # 3. Preprocess + Scale
    df, scaler = preprocess(df)

    # 4. Anomaly Detection
    df = detect_anomalies(df, contamination=contamination)

    # 5. Annotate Types & Reasons
    df = annotate_anomalies(df)

    # 6. Event Clustering
    df, event_df = build_event_summary(df)

    # 7. Visualisations
    plot_engagement_timeline(df)
    plot_anomaly_distribution(df)
    plot_hourly_heatmap(df)
    plot_sentiment_vs_engagement(df)
    plot_top_events(event_df)
    plot_feature_importance(df)
    plot_rolling_anomaly_rate(df)

    # 8. Real-time stream simulation
    if run_stream_sim:
        stream_realtime(df, n_rows=stream_rows)

    # 9. Export
    export_results(df, event_df)

    # 10. Summary Report
    print_summary_report(df, event_df)

    print("✅  Pipeline complete.\n")
    return df, event_df, scaler


# ─────────────────────────────────────────────────────────────
# CELL 13 │ Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    df_final, events_final, scaler_final = run_pipeline(
        dataset_filename = "social_media_dataset.csv",
        contamination    = 0.10,   # adjust to expected anomaly %
        stream_rows      = 80,     # rows to simulate in stream
        run_stream_sim   = True,
    )