# Statistical Drift Detection Engine

## 1. Mathematical Foundations

ModelOps360 implements a mathematically rigorous, dual-pillar statistical drift detection engine.

### Pillar 1: Population Stability Index (PSI)
Measures the shift between the baseline reference feature quantile distribution ($P_{\text{ref}}$) and the current production inference distribution ($Q_{\text{cur}}$):

$$\text{PSI} = \sum_{b=1}^{B} \left( Q_b - P_b \right) \cdot \ln\left( \frac{Q_b}{P_b} \right)$$

#### Thresholds & Operational Meaning:
- **$\text{PSI} < 0.10$**: Stable distribution. No covariate shift.
- **$0.10 \le \text{PSI} < 0.20$**: Moderate shift. Monitoring flag raised.
- **$\text{PSI} \ge 0.20$**: Significant covariate drift. Retraining policy engine evaluated.

#### Jeffreys Smoothing:
To prevent mathematical explosions ($\ln(0)$ or $\frac{0}{P}$) on finite empirical sample windows, sample-size-aware Jeffreys smoothing is applied:
$$\text{smooth} = \max\left(10^{-4}, \frac{0.5}{\max(10, \min(N_{\text{ref}}, N_{\text{cur}}))}\right)$$

---

### Pillar 2: Two-Sample Kolmogorov-Smirnov (KS) Test
A non-parametric test comparing the empirical cumulative distribution functions (ECDF) of continuous features:

$$D = \sup_x |F_{\text{ref}}(x) - F_{\text{cur}}(x)|$$

The asymptotic p-value determines whether the null hypothesis (that both samples are drawn from the identical continuous distribution) can be rejected at $\alpha = 0.05$.

---

## 2. Drift vs. Performance Degradation (The Core Distinction)

> **Important MLOps Principle**:
> **Data drift does NOT automatically imply model performance degradation.**

1. **Covariate Drift (Input Shift)**:
   - Changes in price or discount distributions.
   - Triggers investigation and candidates for retraining.
   - **Does NOT** automatically demote the production model.
2. **Concept Drift (Performance Degradation)**:
   - Measured when actual sales labels arrive.
   - If $\text{RMSE}_{\text{live}} > 1.25 \times \text{RMSE}_{\text{baseline}}$, the model is confirmed degraded.
   - Immediately qualifies for automated retraining.
