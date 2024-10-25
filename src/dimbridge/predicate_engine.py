import torch
from torch import nn
from torch import optim

import numpy as np
import pandas as pd

import io
from glob import glob
from textwrap import dedent
from base64 import b64encode
from natsort import natsorted
import os

from tqdm import tqdm


def predict(x, a, mu):
    r"""
    UMAP-inspired predict function.
    A bump function centered at $\\mu$ with extent determined by $1/|a|$.

    $$ pred = \frac{1}{1+ \sum_{i=1}^{p} |a_i| * |x_i - \mu_i|^{b}} $$

    Parameters
    ----------
    x - Torch tensor, shape [n_data_points, n_features]
        Input data points
    a - Torch tensor, shape [n_features]
        A parameter for the bounding box extent. 1/a.abs() is the extent of bounding box at prediction=0.5
    mu - Torch tensor, shape [n_features]
        A parameter for the bounding box center
    b - Scalar.
        Hyperparameter for predict function. Power exponent

    Returns
    -------
    pred - Torch tensor of predction for each point in x, shape = [n_data_points, 1]
    """

    b = 4
    pred = 1 / (1 + ((a.abs() * (x - mu).abs()).pow(b)).sum(1))
    return pred


def compute_predicate_sequence(
    x0,
    selected,
    attribute_names=[],
    n_iter=1000,
):
    """
    x0 - numpy array, shape=[n_points, n_feature]. Data points
    selected - boolean array. shape=[brush_index, n_points] of selection
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"

    n_points, n_features = x0.shape
    n_brushes = selected.shape[0]

    # prepare training data
    # orginal data extent
    vmin = x0.min(0)
    vmax = x0.max(0)
    x = torch.from_numpy(x0.astype(np.float32)).to(device)
    label = torch.from_numpy(selected).float().to(device)
    # normalize
    mean = x.mean(0)
    scale = x.std(0) + 1e-6
    x = (x - mean) / scale

    # Trainable parameters
    # since data is normalized,
    # mu can initialized around mean_pos examples
    # a can initialized around a constant across all axes
    selection_centroids = torch.stack([x[sel_t].mean(0) for sel_t in selected], 0)
    selection_std = torch.stack([x[sel_t].std(0) for sel_t in selected], 0)

    # initialize the bounding box center (mu) at the data centroid, +-0.1 at random
    mu_init = selection_centroids
    a_init = 1 / selection_std
    # a = (a_init + 0.1 * (2 * torch.rand(n_brushes, n_features) - 1)).to(device)
    # mu = mu_init + 0.1 * (2 * torch.rand(n_brushes, x.shape[1], device=device) - 1)
    a = a_init.to(device)
    mu = mu_init.to(device)
    a.requires_grad_(True)
    mu.requires_grad_(True)

    # For each brush,
    # weight-balance selected vs. unselected based on their size
    # and create a weighted BCE loss function (for each brush)
    bce_per_brush = []
    for st in selected:  # for each brush, define their class-balanced loss function
        n_selected = st.sum()  # st is numpy array
        n_unselected = n_points - n_selected
        instance_weight = torch.ones(x.shape[0]).to(device)
        instance_weight[st] = n_points / n_selected  # helps recall
        instance_weight[~st] = 2 * n_points / n_unselected  # helps precision
        bce = nn.BCELoss(weight=instance_weight)
        bce_per_brush.append(bce)

    optimizer = optim.SGD(
        [
            {"params": mu, "weight_decay": 0},
            # smaller a encourages larger range of the bounding box
            {"params": a, "weight_decay": 0.25},
        ],
        lr=1e-2,
        momentum=0.8,
        nesterov=True,
    )

    # training loop
    bar = tqdm(range(n_iter))
    for e in bar:
        loss_per_brush = []
        for t, st in enumerate(selected):  # for each brush, compute loss
            # TODO try subsample:
            # use all selected data
            # randomly sample unselected data with similar size
            pred = predict(x, a[t], mu[t])
            loss = bce_per_brush[t](pred, label[t])
            # loss += (mu[t] - selection_centroids[t]).pow(2).mean() * 20
            loss_per_brush.append(loss)
            smoothness_loss = 0
            if len(selected) == 2:
                smoothness_loss += 5 * (a[1:] - a[:-1]).pow(2).mean()
                # smoothness_loss += 1 * (mu[1:] - mu[:-1]).pow(2).mean()
            elif len(selected) > 2:
                smoothness_loss += 50 * (a[1:] - a[:-1]).pow(2).mean()
                # smoothness_loss += 1 * (mu[1:] - mu[:-1]).pow(2).mean()

        # print('bce', loss_per_brush)
        # print('smoothness', smoothness_loss.item())
        # sparsity_loss = 0
        # sparsity_loss = a.abs().mean() * 100
        total_loss = sum(loss_per_brush) + smoothness_loss  # + sparsity_loss
        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()
        # if e % max(1, (n_iter // 10)) == 0:
        # print(pred.min().item(), pred.max().item())
        bar.set_postfix({"loss": loss.item()})
    a.detach_()
    mu.detach_()
    # plt.stem(a.abs().numpy()); plt.show()

    qualities = []
    for t, st in enumerate(selected):  # for each brush, compute quality
        pred = predict(x, a[t], mu[t])
        pred = (pred > 0.5).float()
        correct = (pred == label[t]).float().sum().item()
        total = n_points
        accuracy = correct / total
        # 1 meaning points are selected
        tp = ((pred == 1).float() * (label == 1).float()).sum().item()
        fp = ((pred == 1).float() * (label == 0).float()).sum().item()
        fn = ((pred == 0).float() * (label == 1).float()).sum().item()
        precision = tp / (tp + fp) if tp + fp > 0 else 0
        recall = tp / (tp + fn) if tp + fn > 0 else 0
        f1 = 2 / (1 / precision + 1 / recall) if precision > 0 and recall > 0 else 0
        print(
            dedent(
                f"""
            brush = {t}
            accuracy = {accuracy}
            precision = {precision}
            recall = {recall}
            f1 = {f1}
        """
            )
        )
        qualities.append(
            dict(brush=t, accuracy=accuracy, precision=precision, recall=recall, f1=f1)
        )

    # predicate clause selection
    # r is the range of the bounding box on each dimension
    # bounding box is defined by the level set of prediction=0.5
    predicates = []
    # for each brush, generate a predicate from a[t] and mu[t]
    for t, st in enumerate(selected):
        r = 1 / a[t].abs()
        predicate_clauses = []
        for k in range(n_features):  # for each attribute
            vmin_selected = x0[st, k].min()
            vmax_selected = x0[st, k].max()
            # denormalize
            r_k = (r[k] * scale[k]).item()
            mu_k = (mu[t, k] * scale[k] + mean[k]).item()
            ci = [mu_k - r_k, mu_k + r_k]
            assert ci[0] < ci[1], "ci[0] is not less than ci[1]"

            # feature selection based on extent range
            should_include = not (ci[0] <= vmin[k] and ci[1] >= vmax[k])
            if ci[0] < vmin[k]:
                ci[0] = vmin[k]
            if ci[1] > vmax[k]:
                ci[1] = vmax[k]
            if should_include:
                if ci[0] < vmin_selected:
                    ci[0] = vmin_selected
                if ci[1] > vmax_selected:
                    ci[1] = vmax_selected
                predicate_clauses.append(
                    dict(
                        dim=k,
                        interval=ci,
                        attribute=attribute_names[k],
                    )
                )
        predicates.append(predicate_clauses)
    parameters = dict(mu=mu, a=a)
    return predicates, qualities, parameters
