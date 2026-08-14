from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(r"D:\OneDrive\OneDrive - cosapi.com.pe\Documents\Inventario_Project")
OUT = ROOT / "output" / "pdf" / "mining_to_quant_thesis_guide.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#12345B")
DEEP = colors.HexColor("#0D263F")
BLUE = colors.HexColor("#1667A8")
TEAL = colors.HexColor("#177765")
PALE_TEAL = colors.HexColor("#E7F5F0")
PALE_BLUE = colors.HexColor("#E8F2FA")
PALE_GOLD = colors.HexColor("#FBF5E8")
GOLD = colors.HexColor("#DC9F25")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5F6B7A")
LINE = colors.HexColor("#DCE3EC")
PAPER = colors.HexColor("#F5F8FB")
WHITE = colors.white


class NumberedDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="main",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="all", frames=frame, onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        canvas.setTitle("Mining Automation Thesis Ideas for a Transition to Quant Finance")
        canvas.setAuthor("Independent thesis-selection guide")
        if doc.page == 1:
            canvas.setFillColor(DEEP)
            canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#123F69"))
            canvas.circle(PAGE_W + 10 * mm, PAGE_H - 20 * mm, 65 * mm, fill=1, stroke=0)
            canvas.setStrokeColor(colors.Color(1, 1, 1, alpha=0.10))
            canvas.setLineWidth(1)
            canvas.circle(PAGE_W - 10 * mm, 35 * mm, 55 * mm, fill=0, stroke=1)
            canvas.circle(PAGE_W - 10 * mm, 35 * mm, 75 * mm, fill=0, stroke=1)
        else:
            canvas.setStrokeColor(LINE)
            canvas.line(doc.leftMargin, PAGE_H - 15 * mm, PAGE_W - doc.rightMargin, PAGE_H - 15 * mm)
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(MUTED)
            canvas.drawString(doc.leftMargin, PAGE_H - 11.5 * mm, "MINING AUTOMATION TO QUANTITATIVE FINANCE")
            canvas.drawRightString(PAGE_W - doc.rightMargin, 10 * mm, f"Page {doc.page}")
            canvas.drawString(doc.leftMargin, 10 * mm, "Shareable thesis-selection guide")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverEyebrow", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=8.5, leading=11, textColor=colors.HexColor("#9DE3DF"),
    spaceAfter=10, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=31, leading=34, textColor=WHITE, spaceAfter=18, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=12, leading=18, textColor=colors.HexColor("#DBEAF4"), spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=21, leading=25, textColor=NAVY, spaceBefore=3, spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=14.5, leading=18, textColor=NAVY, spaceBefore=8, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="H3x", parent=styles["Heading3"], fontName="Helvetica-Bold",
    fontSize=10, leading=13, textColor=colors.HexColor("#33435B"),
    spaceBefore=8, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="BodyX", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.3, leading=14, textColor=INK, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="BodySmall", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.1, leading=11.5, textColor=INK, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="Muted", parent=styles["BodyX"], textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Thesis", parent=styles["BodyText"], fontName="Times-Italic",
    fontSize=11.2, leading=15, textColor=colors.HexColor("#293950"),
    leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=9,
))
styles.add(ParagraphStyle(
    name="WhiteH", parent=styles["H1x"], textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="WhiteBody", parent=styles["BodyX"], textColor=colors.HexColor("#E4F0F3"),
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodySmall"], fontName="Helvetica-Bold",
    fontSize=7.2, leading=9, textColor=colors.HexColor("#526176"),
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["BodySmall"], fontSize=7.5, leading=10,
))
styles.add(ParagraphStyle(
    name="Source", parent=styles["BodySmall"], fontSize=8, leading=11.2, textColor=NAVY,
))


def P(text, style="BodyX"):
    return Paragraph(text, styles[style])


def bullet_list(items, level=0, color=BLUE):
    return ListFlowable(
        [ListItem(P(item, "BodyX"), leftIndent=8) for item in items],
        bulletType="bullet",
        start="circle",
        bulletColor=color,
        bulletFontSize=5,
        leftIndent=17,
        bulletOffsetY=2,
        spaceBefore=1,
        spaceAfter=6,
    )


def number_list(items):
    return ListFlowable(
        [ListItem(P(item, "BodyX"), leftIndent=7) for item in items],
        bulletType="1",
        leftIndent=19,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=8,
        bulletColor=TEAL,
        spaceAfter=6,
    )


def info_box(title, text, background=PALE_TEAL, accent=TEAL):
    content = [P(f"<b>{title}</b>", "BodyX"), P(text, "BodySmall")]
    t = Table([[content]], colWidths=[165 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.5, accent),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def thesis_box(title):
    t = Table([[P(title, "Thesis")]], colWidths=[165 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_GOLD),
        ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def section_banner(number, label, title):
    number_box = Table([[P(f"<font color='#FFFFFF'><b>{number}</b></font>", "H2x")]], colWidths=[14 * mm], rowHeights=[14 * mm])
    number_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, NAVY),
    ]))
    text = [P(f"<font color='#1667A8'><b>{label.upper()}</b></font>", "BodySmall"), P(title, "H1x")]
    tbl = Table([[number_box, text]], colWidths=[18 * mm, 147 * mm], hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return tbl


story = []

# Cover
story.extend([
    Spacer(1, 44 * mm),
    P("ELECTRICAL ENGINEERING | MINING AUTOMATION | QUANTITATIVE FINANCE", "CoverEyebrow"),
    P("Thesis ideas for a later transition into quant finance", "CoverTitle"),
    P("A focused guide to mining-industry research topics that fit computer architecture or electric power systems while developing transferable skills for quantitative research, algorithmic trading, and low-latency engineering.", "CoverSub"),
    Spacer(1, 15 * mm),
    Table([
        [P("<font color='#FFFFFF'><b>Less control theory</b></font>", "BodySmall"),
         P("<font color='#FFFFFF'><b>Real mining relevance</b></font>", "BodySmall")],
        [P("<font color='#FFFFFF'><b>Reusable quantitative methods</b></font>", "BodySmall"),
         P("<font color='#FFFFFF'><b>Feasible thesis scope</b></font>", "BodySmall")],
    ], colWidths=[70 * mm, 70 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(1, 1, 1, alpha=0.08)),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.Color(1, 1, 1, alpha=0.25)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.Color(1, 1, 1, alpha=0.15)),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ])),
    Spacer(1, 27 * mm),
    P("Standalone edition - no OpenAI account required", "CoverEyebrow"),
    PageBreak(),
])

# Executive strategy
story.extend([
    P("Central strategy", "H3x"),
    P("Transfer the technical core - not the mining model", "H1x"),
    P("The thesis should solve an authentic mining problem while building methods that can later be reapplied to markets: non-stationary time series, streaming computation, rare-event detection, uncertainty, constrained optimization, and rigorous temporal evaluation."),
    P("A bearing classifier will not become a trading signal, and a haul-truck policy will not become an execution algorithm. What transfers is the ability to model changing regimes, prevent time leakage, quantify tail risk, process events with low latency, and test decisions out of sample."),
    info_box(
        "Important positioning choice",
        "Keep 'quantitative trading' out of the formal thesis title unless the university explicitly supports an interdisciplinary thesis. Put the finance connection in a portability or future-work chapter and build a separate financial companion project afterward."
    ),
    Spacer(1, 6 * mm),
    P("Choose the quant destination first", "H1x"),
])

track_data = [
    [P("QUANT RESEARCH", "TableHead"), P("ALGORITHMIC TRADING", "TableHead"), P("QUANT DEVELOPER / HFT", "TableHead")],
    [P("Prioritize statistics, time-series modeling, uncertainty calibration, causal discipline, walk-forward validation, and risk-adjusted evaluation.", "BodySmall"),
     P("Prioritize optimization, event-driven simulation, switching or transaction costs, delayed outcomes, scenarios, and constrained allocation.", "BodySmall"),
     P("Prioritize C/C++, hardware-software co-design, streaming pipelines, memory layout, fixed-point arithmetic, latency distributions, throughput, and jitter.", "BodySmall")],
    [P("<b>Best matches:</b> regime-aware anomaly detection, survival models, risk-aware energy scheduling.", "BodySmall"),
     P("<b>Best matches:</b> stochastic scheduling and carefully scoped offline dispatch learning.", "BodySmall"),
     P("<b>Best match:</b> FPGA/SoC streaming analytics.", "BodySmall")],
]
track_table = Table(track_data, colWidths=[55 * mm] * 3, repeatRows=1)
track_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PALE_BLUE),
    ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.extend([track_table, Spacer(1, 8 * mm), P("Shortlist ranked for your constraints", "H1x")])

rank_rows = [
    ["Rank", "Thesis direction", "Dept.", "Research", "Latency", "Optimization", "Risk"],
    ["1", "Regime-aware edge anomaly detection", "5/5", "4/5", "4/5", "2/5", "Low-med."],
    ["2", "Risk-aware mining load scheduling", "5/5", "5/5", "2/5", "5/5", "Medium"],
    ["3", "FPGA/SoC streaming accelerator", "5/5", "3/5", "5/5", "3/5", "Medium"],
    ["4", "Failure-risk and event modeling", "3/5", "5/5", "2/5", "3/5", "High*"],
    ["5", "Graph anomaly localization", "5/5", "4/5", "3/5", "3/5", "Medium"],
    ["6", "Offline haul-truck dispatch learning", "3/5", "4/5", "3/5", "5/5", "High"],
]
rank_table = Table(
    [[P(f"<b>{c}</b>", "TableHead") for c in rank_rows[0]]] +
    [[P(c, "TableCell") for c in row] for row in rank_rows[1:]],
    colWidths=[10 * mm, 61 * mm, 17 * mm, 20 * mm, 18 * mm, 25 * mm, 18 * mm],
    repeatRows=1,
)
rank_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PAPER),
    ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#FAFCFE")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.extend([rank_table, P("* High risk if timestamped maintenance histories are unavailable.", "Muted"), PageBreak()])

# Idea 1
story.extend([
    section_banner("1", "Best overall balance", "Regime-aware anomaly detection for mining motors and drives"),
    thesis_box("Regime-Aware Anomaly Detection for Electromechanical Drives in Mining Applications Using Motor-Current and Vibration Signals"),
    P("Conveyors, crushers, pumps, fans, and mill auxiliaries operate under changing speed, load, ore characteristics, and environmental conditions. A useful detector must distinguish a legitimate operating change from equipment degradation."),
    P("Research question", "H2x"),
    P("Can an anomaly detector maintain a controlled false-alarm rate under operating regimes not represented during training?"),
    P("Methods", "H2x"),
    bullet_list([
        "Measure or use three-phase current, vibration, speed, torque, temperature, and load.",
        "Segment regimes using clustering, hidden-state models, or change-point detection.",
        "Compare statistical features, isolation forest, autoencoders, and a small temporal model.",
        "Use condition-aware or conformal thresholds.",
        "Optionally deploy the selected model on ARM or FPGA/SoC hardware.",
    ]),
    P("Correct evaluation", "H2x"),
    bullet_list([
        "False alarms per operating hour, precision-recall, and detection delay.",
        "Hold out complete load or speed regimes instead of randomly mixing windows.",
        "Report latency, memory, and energy use alongside detection performance.",
        "Use chronological splits to avoid leakage between adjacent signal windows.",
    ]),
    info_box(
        "Transfer to quantitative finance",
        "Market-regime identification, volatility and liquidity change detection, online anomaly scoring, distribution-shift monitoring, threshold calibration, walk-forward validation, and low-latency inference.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    Spacer(1, 3 * mm),
    info_box(
        "Feasible data path",
        "The public Paderborn dataset provides synchronized current and vibration measurements across multiple operating conditions and includes naturally and artificially damaged bearings. The research contribution should be robustness to regime changes, calibrated alerts, or hardware-aware deployment - not merely another CNN classifier.",
        background=PALE_GOLD,
        accent=GOLD,
    ),
    PageBreak(),
])

# Idea 2
story.extend([
    section_banner("2", "Best power-systems route", "Distributionally robust scheduling of mining electrical loads"),
    thesis_box("Risk-Aware Scheduling of Energy-Intensive Mining Loads Under Production and Power-Demand Uncertainty"),
    P("Optimize a shift-level or day-ahead schedule for one subsystem: pumps, conveyors, crushing, a SAG-mill stockpile, or a mine microgrid. This is operations research and power-system scheduling rather than classical feedback control."),
    P("Research question", "H2x"),
    P("Does stochastic or distributionally robust scheduling outperform deterministic scheduling when load, throughput, renewable generation, ore hardness, or equipment availability differs from forecasts?"),
    P("Model", "H2x"),
    bullet_list([
        "Forecast load or throughput using quantile regression, gradient boosting, or another interpretable model.",
        "Generate uncertainty scenarios and formulate a mixed-integer schedule.",
        "Include production requirements, maximum demand, equipment availability, minimum run and stop times, stockpile or tank constraints, and switching costs.",
        "Add a tail-risk measure such as Conditional Value at Risk (CVaR) or chance constraints.",
        "Compare fixed, deterministic, two-stage stochastic, and distributionally robust schedules.",
    ]),
    P("Evaluation", "H2x"),
    bullet_list([
        "Energy cost and peak demand.",
        "Production shortfall and number of equipment transitions.",
        "Worst-case and CVaR cost under out-of-sample scenarios.",
        "Optimization runtime and feasibility under stressed assumptions.",
    ]),
    info_box(
        "Direct quantitative mapping",
        "Electrical capacity maps to capital allocation; production constraints to exposure limits; equipment switching to transaction costs; demand uncertainty to return or liquidity uncertainty; CVaR of operating cost to CVaR of portfolio loss; and rolling schedules to rebalancing or execution schedules.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    Spacer(1, 3 * mm),
    info_box(
        "Scope discipline",
        "Model one process and one main uncertainty source. A whole-mine microgrid plus production plant, vehicles, and renewables is too broad for one thesis.",
        background=PALE_GOLD,
        accent=GOLD,
    ),
    PageBreak(),
])

# Idea 3
story.extend([
    section_banner("3", "Best quant developer / HFT route", "FPGA or SoC accelerator for streaming industrial analytics"),
    thesis_box("Hardware-Software Co-Design of a Low-Latency Streaming Analytics Engine for Mining Equipment Condition Monitoring"),
    P("Build a deterministic streaming pipeline for rolling statistics and a compact anomaly model. Compare a desktop CPU, embedded ARM, and FPGA or heterogeneous SoC using floating-point and fixed-point implementations."),
    P("Possible streaming kernels", "H2x"),
    bullet_list([
        "Rolling mean, variance, covariance, RMS, kurtosis, and crest factor.",
        "Spectral-band energy and exponentially weighted statistics.",
        "CUSUM or online change-point scores.",
        "A small tree ensemble, autoencoder, or temporal convolutional network.",
    ]),
    P("Hardware contribution", "H2x"),
    bullet_list([
        "Streaming windows without repeatedly copying complete windows.",
        "Fixed-point word-length selection and numerical error analysis.",
        "An accuracy-latency-energy frontier.",
        "Median, p99, and worst-case latency, plus throughput and jitter.",
        "Memory footprint, power consumption, and FPGA resource utilization.",
    ]),
    info_box(
        "Transfer to quantitative finance",
        "The architecture can later be retargeted to rolling volatility, order-flow imbalance, microprice, moving covariance, and online change scores from market events. The algorithms and data interfaces change, but the systems principles transfer directly.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    Spacer(1, 3 * mm),
    info_box(
        "Avoid scope explosion",
        "Do not build a new network stack, SCADA platform, sensor board, FPGA accelerator, and deep model in the same thesis. Select one signal source, one model family, and one target board.",
        background=PALE_GOLD,
        accent=GOLD,
    ),
    PageBreak(),
])

# Idea 4
story.extend([
    section_banner("4", "Strongest mathematical bridge", "Survival analysis and temporal point processes for failures"),
    thesis_box("Dynamic Failure-Risk Estimation for Mining Equipment Using Censored Maintenance and Telemetry Data"),
    P("Estimate a probability distribution for time to failure instead of producing a simple healthy or faulty classification. The practical output is a calibrated probability of failure within future horizons such as 24, 72, or 168 hours."),
    P("Methods", "H2x"),
    bullet_list([
        "Weibull and accelerated-failure-time models.",
        "Cox models with time-varying covariates.",
        "Random survival forests.",
        "Competing-risk models for different failure modes.",
        "Temporal point processes for failure and repair events.",
    ]),
    P("Evaluation", "H2x"),
    bullet_list([
        "Calibration and time-dependent Brier score.",
        "Concordance and useful warning lead time.",
        "Expected maintenance or downtime cost.",
        "Correct handling of equipment that has not yet failed, known as censoring.",
    ]),
    info_box(
        "Transfer to quantitative finance",
        "Default-risk modeling, trade and order-arrival intensity, time to liquidity events, threshold-crossing problems, and competing event types.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    Spacer(1, 3 * mm),
    info_box(
        "Data gate",
        "Choose this only if you can obtain timestamped operating hours, failures, repairs, and still-operating equipment. Ordinary labeled sensor snapshots are not sufficient.",
        background=PALE_GOLD,
        accent=GOLD,
    ),
    PageBreak(),
])

# Idea 5
story.extend([
    section_banner("5", "Strong power-network fit", "Topology-aware anomaly localization in mine distribution networks"),
    thesis_box("Topology-Aware Detection and Localization of Abnormal Events in Mining Electrical Distribution Networks"),
    P("Represent substations, transformers, feeders, variable-frequency drives, and large motors as a graph. Compare independent per-device alarms against models that use the physical network topology."),
    P("Possible experiments", "H2x"),
    bullet_list([
        "Electrical faults and protection events.",
        "Sensor failures and missing measurements.",
        "Motor starts and legitimate transients.",
        "Harmonic disturbances, load shifts, and voltage anomalies.",
    ]),
    P("Implementation path", "H2x"),
    bullet_list([
        "Use OpenDSS, MATLAB/Simulink, or available power-system software.",
        "Implement topology-aware residuals as a strong baseline.",
        "Use a graph neural network only if it improves localization or robustness.",
        "Test sensitivity to topology changes, missing sensors, and unseen load combinations.",
    ]),
    info_box(
        "Transfer to quantitative finance",
        "Dynamic correlation graphs, cross-sectional anomaly detection, sector or counterparty networks, contagion, and systemic-risk propagation. The transfer is conceptual because financial graph structure is inferred rather than physically fixed.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    PageBreak(),
])

# Idea 6
story.extend([
    section_banner("6", "Closest to algorithmic execution - highest risk", "Conservative offline learning for haul-truck dispatch"),
    thesis_box("Risk-Constrained Offline Policy Learning for Open-Pit Mine Truck Dispatch Under Equipment and Travel-Time Uncertainty"),
    P("Use a discrete-event simulator to compare dispatch heuristics, mixed-integer optimization, contextual bandits, and conservative offline reinforcement learning. The system state includes trucks, queues, shovel availability, destinations, travel times, and production targets."),
    P("Mining metrics", "H2x"),
    bullet_list([
        "Tonnes moved and production-plan compliance.",
        "Queue time and shovel idle time.",
        "Fuel or energy proxy.",
        "Constraint and safety violations.",
        "Robustness to breakdowns and travel-time shifts.",
    ]),
    P("Required baselines", "H2x"),
    bullet_list([
        "Simple dispatch rules and a queue-aware heuristic.",
        "Optimization-based dispatch.",
        "A behavior-cloned historical policy.",
        "Only then, conservative offline reinforcement learning.",
    ]),
    info_box(
        "Transfer to algorithmic trading",
        "Sequential resource allocation, congestion and capacity, uncertain execution times, delayed rewards, policy evaluation, market-impact-like costs, and safe offline decision learning.",
        background=PALE_BLUE,
        accent=BLUE,
    ),
    Spacer(1, 3 * mm),
    info_box(
        "Major warning",
        "Do not choose this without operational histories or a simulator you can validate. An agent that only beats weak rules inside an unrealistic simulator is not convincing research.",
        background=PALE_GOLD,
        accent=GOLD,
    ),
    PageBreak(),
])

# Recommendation
story.extend([
    P("Recommended direction", "H3x"),
    P("The best single compromise", "H1x"),
    thesis_box("Hardware-Aware, Regime-Adaptive Anomaly Detection for Mining Drive Systems Using Motor-Current Signals"),
    P("This direction fits both computer architecture and electrical engineering, needs little classical control theory, can start with public data, and produces a portfolio that supports either quant research or low-latency engineering."),
    P("Core thesis scope", "H2x"),
    number_list([
        "Build a condition-aware anomaly detector.",
        "Use temporally correct validation and withhold full operating regimes.",
        "Calibrate alerts for a target false-alarm rate.",
        "Deploy a compact version on ARM or FPGA/SoC.",
        "Report accuracy, detection delay, latency, memory, and power.",
    ]),
    P("Why it helps the transition", "H2x"),
    bullet_list([
        "Streaming multivariate time series.",
        "Regime and distribution shifts.",
        "Rare-event and imbalanced evaluation.",
        "Online thresholds and change detection.",
        "Efficient implementation and latency measurement.",
    ]),
    info_box(
        "Power-systems alternative",
        "If your strongest potential supervisor works in power-system optimization, choose the risk-aware load-scheduling thesis instead. It is the cleaner route into portfolio optimization, optimal execution, and risk modeling."
    ),
    PageBreak(),
])

# Transition plan
story.extend([
    P("Transition roadmap", "H3x"),
    P("Turn the thesis into a quant-ready portfolio", "H1x"),
    P("The transition becomes credible when you demonstrate that the abstraction - not just the mining application - was understood."),
])

roadmap = [
    [P("PHASE 1 - THESIS", "TableHead"), P("PHASE 2 - COMPANION PROJECT", "TableHead"), P("PHASE 3 - INTERVIEW SIGNAL", "TableHead")],
    [bullet_list([
        "Use chronological or walk-forward splits.",
        "Keep strong statistical and engineering baselines.",
        "Measure uncertainty, costs, and failure cases.",
        "Write reproducible experiments and tests.",
    ]),
     bullet_list([
        "Use one public financial dataset.",
        "Reimplement the same regime, optimization, or streaming abstraction.",
        "Include fees, slippage, latency, and realistic baselines.",
        "Do not claim profitability from a small backtest.",
    ]),
     bullet_list([
        "Explain why random validation creates leakage.",
        "Explain how regimes invalidate stationary assumptions.",
        "Explain why p99 latency can matter more than an average.",
        "Explain how constraints and transaction costs alter decisions.",
    ])],
]
roadmap_table = Table(roadmap, colWidths=[55 * mm] * 3, repeatRows=1)
roadmap_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PALE_BLUE),
    ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.extend([roadmap_table, Spacer(1, 7 * mm), P("Recommended technical stack", "H1x")])

stack_rows = [
    ["Area", "During the thesis", "Later financial extension"],
    ["Programming", "Python for research; C/C++ or HDL for the critical path", "Python research pipeline plus production-quality C++ where latency matters"],
    ["Statistics", "Time-series validation, calibration, change detection, uncertainty", "Returns, volatility, microstructure, and multiple-testing awareness"],
    ["Optimization", "MILP, scenarios, CVaR, switching costs", "Portfolio constraints, turnover costs, and optimal execution"],
    ["Systems", "Streaming buffers, profiling, fixed point, and p99 latency", "Event-driven market-data pipeline, jitter, and deterministic processing"],
    ["Evaluation", "Out-of-regime and chronological testing", "Walk-forward backtesting with costs, slippage, and no look-ahead"],
]
stack_table = Table(
    [[P(f"<b>{c}</b>", "TableHead") for c in stack_rows[0]]] + [[P(c, "TableCell") for c in row] for row in stack_rows[1:]],
    colWidths=[28 * mm, 68 * mm, 69 * mm],
    repeatRows=1,
)
stack_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PAPER),
    ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#FAFCFE")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.extend([stack_table, PageBreak()])

# Avoid and sources
story.extend([
    P("Common failure modes", "H3x"),
    P("Ideas and practices to avoid", "H1x"),
    bullet_list([
        "<b>Generic LSTM predictive maintenance:</b> using a fashionable architecture is not a research contribution by itself.",
        "<b>Random train/test splits:</b> adjacent windows and repeated machine states can leak information across the split.",
        "<b>Accuracy-only evaluation:</b> rare failures require precision-recall, false alarms per hour, detection delay, and cost.",
        "<b>Stock-price prediction added to the thesis:</b> it makes the scope look unfocused and usually introduces weak financial methodology.",
        "<b>Deep reinforcement learning without a validated simulator:</b> the agent may exploit simulation errors instead of solving the industrial problem.",
        "<b>A complete mine digital twin:</b> select one decision layer, subsystem, and uncertainty source.",
        "<b>No strong baseline:</b> complex models must beat statistical, heuristic, or optimization baselines under fair temporal testing.",
    ]),
    Spacer(1, 5 * mm),
    P("Selected starting sources", "H1x"),
    P("These links are optional research references. The guide itself remains fully readable offline."),
])

sources = [
    ("Paderborn University Bearing DataCenter - datasets and operating conditions", "https://mb.uni-paderborn.de/en/kat/research/bearing-datacenter/data-sets-and-download"),
    ("Domain shifts in industrial condition monitoring - comparative model study", "https://jsss.copernicus.org/articles/14/119/2025/"),
    ("UCI AI4I 2020 Predictive Maintenance Dataset", "https://archive.ics.uci.edu/dataset/601/ai4i%2B2020%2Bpredictive%2Bmaintenance%2Bda"),
    ("Demand-side management of a run-of-mine ore milling circuit", "https://www.sciencedirect.com/science/article/abs/pii/S0967066113000233"),
    ("Integrating throughput predictions into stochastic mine production scheduling", "https://www.sciencedirect.com/science/article/pii/S2095268622001021"),
    ("Deep reinforcement-learning-based real-time open-pit truck dispatch", "https://www.sciencedirect.com/science/article/pii/S0305054824002879"),
    ("Mixed-integer truck dispatch with traffic constraints - copper-mine case", "https://www.sciencedirect.com/science/article/pii/S1877050923021798"),
    ("PV and battery integration for operating a SAG mill", "https://www.sciencedirect.com/science/article/abs/pii/S0959652617315536"),
]
for i, (label, url) in enumerate(sources, 1):
    story.append(P(f"<b>{i}.</b> <link href='{url}' color='#1667A8'>{label}</link><br/><font color='#5F6B7A' size='7'>{url}</font>", "Source"))

story.extend([
    Spacer(1, 5 * mm),
    info_box(
        "Final selection rule",
        "Choose the strongest supervisor and data combination, not merely the most fashionable algorithm. A narrower, carefully validated thesis with a real industrial constraint will transfer to quantitative finance better than an ambitious but weakly evaluated finance-themed project."
    ),
])


doc = NumberedDocTemplate(
    str(OUT),
    pagesize=A4,
    rightMargin=22 * mm,
    leftMargin=22 * mm,
    topMargin=22 * mm,
    bottomMargin=18 * mm,
    title="Mining Automation Thesis Ideas for a Transition to Quant Finance",
    author="Independent thesis-selection guide",
    subject="Mining automation, electrical engineering, quantitative finance, algorithmic trading",
)
doc.build(story)
print(OUT)
